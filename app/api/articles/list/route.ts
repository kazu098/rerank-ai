import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGSCClient, GSCRow } from "@/lib/gsc-api";
import { getSitesByUserId, getSiteById, convertUrlPropertyToDomainProperty, updateSiteUrl, normalizeSiteUrlForComparison } from "@/lib/db/sites";
import { getArticlesBySiteId, getArticleByUrl } from "@/lib/db/articles";
import { getCache, generateCacheKey } from "@/lib/cache";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

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
    const { session, locale } = await getSessionAndLocale(request);
    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const siteUrl = searchParams.get("siteUrl");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");

    if (!siteUrl) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.siteUrlParameterRequired") },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(session.userId as string);
    
    // URLを正規化して比較（共通関数を使用）
    const normalizedSiteUrl = normalizeSiteUrlForComparison(siteUrl);
    
    // 同じドメインに対して複数のエントリがある場合、sc-domain: 形式を優先
    // （sc-domain: 形式はGSC APIで403エラーが発生しにくい）
    const matchingSites = sites.filter((s) => {
      const normalizedDbUrl = normalizeSiteUrlForComparison(s.site_url);
      return normalizedDbUrl === normalizedSiteUrl;
    });
    
    // sc-domain: 形式を優先して選択
    let site = matchingSites.find((s) => s.site_url.startsWith("sc-domain:"));
    if (!site && matchingSites.length > 0) {
      site = matchingSites[0];
    }

    if (!site) {
      console.error("[Articles List API] Site not found:", {
        requestedUrl: siteUrl,
        normalizedUrl: normalizedSiteUrl,
        availableSites: sites.map(s => s.site_url),
      });
      const { locale } = await getSessionAndLocale(request);
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.siteNotFound") },
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

    // キャッシュキーを生成
    const cache = getCache();
    const cacheKey = generateCacheKey("articles:list", site.id, startDate, endDate);
    
    // キャッシュから取得を試みる
    let gscData = cache.get<any>(cacheKey);
    
    if (!gscData) {
      // キャッシュにない場合はGSC APIから取得
      const gscClient = await getGSCClient();
      try {
        gscData = await gscClient.getPageUrls(site.site_url, startDate, endDate, 1000);
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        const is403Error = errorMessage.includes('403') || errorMessage.includes('Forbidden') || errorMessage.includes('permission');
        
        // 403エラーでURLプロパティ形式の場合、ドメインプロパティ形式に変換して再試行
        if (is403Error && site.site_url.startsWith('https://')) {
          const domainPropertyUrl = convertUrlPropertyToDomainProperty(site.site_url);
          if (domainPropertyUrl) {
            console.log(`[Articles List] 403 error with URL property format, retrying with domain property format: ${domainPropertyUrl}`);
            
            // GSC APIのリトライ
            let gscRetrySucceeded = false;
            try {
              gscData = await gscClient.getPageUrls(domainPropertyUrl, startDate, endDate, 1000);
              gscRetrySucceeded = true;
              console.log(`[Articles List] GSC API retry succeeded with domain property format`);
            } catch (gscRetryError: any) {
              // GSC APIリトライが失敗した場合、元のエラーを再スロー
              console.error(`[Articles List] GSC API retry failed:`, gscRetryError.message);
              throw error;
            }
            
            // GSC APIが成功した場合のみ、サイトURLの更新を試みる
            if (gscRetrySucceeded) {
              const oldSiteUrl = site.site_url;
              try {
                await updateSiteUrl(site.id, domainPropertyUrl);
                console.log(`[Articles List] Site URL updated from ${oldSiteUrl} to ${domainPropertyUrl}`);
              } catch (updateError: any) {
                // updateSiteUrl のエラーは警告のみ（GSC APIは成功しているため処理を続行）
                console.warn(`[Articles List] Failed to update site URL, but GSC API succeeded. Continuing...`, updateError.message);
              }
              // メモリ上のsite.site_urlを更新（後続の処理で使用されるため）
              site.site_url = domainPropertyUrl;
            }
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      
      // キャッシュに保存（TTL: 1時間）
      cache.set(cacheKey, gscData, 3600);
    }

    // GSCから取得したURL一覧
    type GSCUrlItem = {
      url: string;
      impressions: number;
      clicks: number;
      position: number;
    };
    
    const gscUrls: GSCUrlItem[] = (gscData.rows || [])
      .map((row: GSCRow) => {
        // keys[0]がページURL
        const pageUrl = row.keys[0];
        // 完全なURLに変換（DBに保存されているsite.site_urlを使用）
        let fullUrl: string;
        if (site.site_url.startsWith("sc-domain:")) {
          const domain = site.site_url.replace("sc-domain:", "");
          fullUrl = pageUrl.startsWith("http")
            ? pageUrl
            : `https://${domain}${pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`}`;
        } else {
          const siteUrlWithoutSlash = site.site_url.replace(/\/$/, "");
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
      .filter((gscUrl: GSCUrlItem) => isArticleUrl(gscUrl.url)); // 記事として扱うべきURLのみをフィルタリング

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

    // DBの記事をURLでインデックス化（高速化のため）
    const dbArticlesMap = new Map<string, typeof dbArticles[0]>();
    for (const article of dbArticles) {
      const normalizedDbUrl = normalizeUrl(article.url);
      dbArticlesMap.set(normalizedDbUrl, article);
    }

    // DBの記事とGSCのURLをマージ
    // DBにタイトルがある場合はそれを使用、ない場合はnull
    // URLを正規化して比較（ハッシュフラグメントを除去）
    const mergedArticles = Array.from(urlMap.values()).map((gscUrl) => {
      // gscUrl.urlは既に正規化済み
      const dbArticle = dbArticlesMap.get(gscUrl.url);
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

    // ページネーション
    const total = mergedArticles.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedArticles = mergedArticles.slice(startIndex, endIndex);

    return NextResponse.json(
      {
        articles: paginatedArticles,
        total,
        page,
        pageSize,
        totalPages,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching article list:", error);
    return NextResponse.json(
      { error: error.message || "記事一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

