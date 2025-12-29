import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGSCClient } from "@/lib/gsc-api";
import { getSitesByUserId, getSiteById } from "@/lib/db/sites";
import { getArticlesBySiteId, getArticleByUrl } from "@/lib/db/articles";

/**
 * URLからハッシュフラグメント（#以降）を除去して正規化
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = ''; // ハッシュフラグメントを除去
    return urlObj.toString();
  } catch (error) {
    // URL解析に失敗した場合は、単純に#以降を除去
    const hashIndex = url.indexOf('#');
    return hashIndex >= 0 ? url.substring(0, hashIndex) : url;
  }
}

/**
 * 記事として扱うべきURLかどうかを判定
 * タグページ、カテゴリーページ、メディアファイルなどを除外
 */
function isArticleUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  const pathname = new URL(url).pathname.toLowerCase();
  
  // 除外するパスパターン
  const excludePatterns = [
    '/tag/',           // タグページ
    '/category/',      // カテゴリーページ
    '/wp-content/uploads/', // メディアファイル
    '/author/',        // 著者ページ
    '/feed/',          // RSSフィード
    '/wp-json/',      // REST API
    '/wp-admin/',      // 管理画面
    '/wp-includes/',   // WordPressコアファイル
    '/page/',          // ページネーションページ（記事のページネーションは除外）
    '/search/',        // 検索結果ページ
    '/archive/',       // アーカイブページ（年月別など）
  ];
  
  // 除外パターンに一致する場合はfalse
  for (const pattern of excludePatterns) {
    if (pathname.includes(pattern)) {
      return false;
    }
  }
  
  // 画像ファイルの拡張子を除外
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp'];
  for (const ext of imageExtensions) {
    if (urlLower.endsWith(ext)) {
      return false;
    }
  }
  
  // その他のファイル拡張子を除外
  const fileExtensions = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx', '.css', '.js'];
  for (const ext of fileExtensions) {
    if (urlLower.endsWith(ext)) {
      return false;
    }
  }
  
  return true;
}

/**
 * 記事一覧を取得（GSC + DB）
 * GET /api/articles/list?siteUrl=...
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const siteUrl = searchParams.get("siteUrl");

    if (!siteUrl) {
      return NextResponse.json(
        { error: "siteUrlパラメータが必要です" },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(session.userId as string);
    const site = sites.find((s) => s.site_url === siteUrl);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // DBに保存済みの記事を取得
    const dbArticles = await getArticlesBySiteId(site.id);

    // GSC APIからページURL一覧を取得
    // 過去90日間のデータを取得（検索結果に表示されたページのみ）
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const gscClient = await getGSCClient();
    const gscData = await gscClient.getPageUrls(siteUrl, startDate, endDate, 1000);

    // GSCから取得したURL一覧
    const gscUrls = (gscData.rows || [])
      .map((row) => {
        // keys[0]がページURL
        const pageUrl = row.keys[0];
        // 完全なURLに変換
        let fullUrl: string;
        if (siteUrl.startsWith("sc-domain:")) {
          const domain = siteUrl.replace("sc-domain:", "");
          fullUrl = pageUrl.startsWith("http")
            ? pageUrl
            : `https://${domain}${pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`}`;
        } else {
          const siteUrlWithoutSlash = siteUrl.replace(/\/$/, "");
          fullUrl = pageUrl.startsWith("http")
            ? pageUrl
            : `${siteUrlWithoutSlash}${pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`}`;
        }
        // ハッシュフラグメントを除去して正規化
        const normalizedUrl = normalizeUrl(fullUrl);
        return {
          url: normalizedUrl,
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
        };
      })
      .filter((gscUrl) => isArticleUrl(gscUrl.url)); // 記事として扱うべきURLのみをフィルタリング

    // 重複を除去：同じURL（正規化後）のデータを統合
    const urlMap = new Map<string, {
      url: string;
      impressions: number;
      clicks: number;
      position: number;
    }>();
    
    for (const gscUrl of gscUrls) {
      const existing = urlMap.get(gscUrl.url);
      if (existing) {
        // 既に存在する場合は、インプレッション数とクリック数を合計
        // 順位は加重平均を計算（インプレッション数で重み付け）
        const totalImpressions = existing.impressions + gscUrl.impressions;
        const totalClicks = existing.clicks + gscUrl.clicks;
        const weightedPosition = (existing.position * existing.impressions + gscUrl.position * gscUrl.impressions) / totalImpressions;
        
        urlMap.set(gscUrl.url, {
          url: gscUrl.url,
          impressions: totalImpressions,
          clicks: totalClicks,
          position: weightedPosition,
        });
      } else {
        urlMap.set(gscUrl.url, gscUrl);
      }
    }

    // DBの記事とGSCのURLをマージ
    // DBにタイトルがある場合はそれを使用、ない場合はnull
    // URLを正規化して比較（ハッシュフラグメントを除去）
    const mergedArticles = Array.from(urlMap.values()).map((gscUrl) => {
      // gscUrl.urlは既に正規化済み
      const dbArticle = dbArticles.find((a) => {
        const normalizedDbUrl = normalizeUrl(a.url);
        return normalizedDbUrl === gscUrl.url;
      });
      return {
        url: gscUrl.url, // 正規化済みのURLを返す
        title: dbArticle?.title || null,
        impressions: gscUrl.impressions,
        clicks: gscUrl.clicks,
        position: gscUrl.position,
        hasTitleInDb: !!dbArticle?.title,
        last_analyzed_at: dbArticle?.last_analyzed_at || null,
      };
    });

    // インプレッション数でソート（多い順）
    mergedArticles.sort((a, b) => b.impressions - a.impressions);

    return NextResponse.json({
      articles: mergedArticles,
      total: mergedArticles.length,
    });
  } catch (error: any) {
    console.error("Error fetching article list:", error);
    return NextResponse.json(
      { error: error.message || "記事一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

