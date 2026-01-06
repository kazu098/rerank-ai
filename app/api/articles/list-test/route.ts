import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGSCClient } from "@/lib/gsc-api";
import { getSitesByUserId } from "@/lib/db/sites";

/**
 * GSC APIから直接ページ一覧を取得して、特定のURLが含まれているかを確認するテストエンドポイント
 * GET /api/articles/list-test?siteUrl=...&searchUrl=...
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
    const searchUrl = searchParams.get("searchUrl"); // 検索したいURL（オプション）

    if (!siteUrl) {
      return NextResponse.json(
        { error: "siteUrlパラメータが必要です" },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(session.userId as string);
    
    // URLを正規化して比較（https://形式に統一）
    const normalizeSiteUrlForComparison = (url: string): string => {
      if (url.startsWith("https://")) {
        return url.replace(/\/$/, "");
      }
      if (url.startsWith("sc-domain:")) {
        const domain = url.replace("sc-domain:", "");
        return `https://${domain}`;
      }
      if (url.startsWith("http://")) {
        return url.replace("http://", "https://").replace(/\/$/, "");
      }
      return url.replace(/\/$/, "");
    };
    
    const normalizedSiteUrl = normalizeSiteUrlForComparison(siteUrl);
    const site = sites.find((s) => {
      const normalizedDbUrl = normalizeSiteUrlForComparison(s.site_url);
      return normalizedDbUrl === normalizedSiteUrl;
    });

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // GSC APIからページURL一覧を取得
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const gscClient = await getGSCClient();
    const gscData = await gscClient.getPageUrls(siteUrl, startDate, endDate, 1000);

    // GSCから取得したURL一覧を処理
    const gscUrls: string[] = (gscData.rows || []).map((row: any) => {
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
      return fullUrl;
    });

    // 検索URLが指定されている場合、そのURLが含まれているかを確認
    let foundUrl: string | null = null;
    let foundUrlExact: string | null = null;
    if (searchUrl) {
      // 完全一致を探す
      foundUrlExact = gscUrls.find(url => url === searchUrl) || null;
      
      // 部分一致も探す（正規化して比較）
      const normalizeUrl = (url: string): string => {
        try {
          const urlObj = new URL(url);
          urlObj.hash = '';
          return urlObj.toString();
        } catch {
          const hashIndex = url.indexOf('#');
          return hashIndex >= 0 ? url.substring(0, hashIndex) : url;
        }
      };
      
      const normalizedSearchUrl = normalizeUrl(searchUrl);
      foundUrl = gscUrls.find(url => normalizeUrl(url) === normalizedSearchUrl) || null;
    }

    // サブディレクトリと記事の例を抽出（デバッグ用）
    const articlesExample = gscUrls
      .filter(url => url.includes('/articles/'))
      .slice(0, 10);

    return NextResponse.json({
      siteUrl,
      searchUrl: searchUrl || null,
      totalUrls: gscUrls.length,
      foundUrl: foundUrl || null,
      foundUrlExact: foundUrlExact || null,
      searchResult: searchUrl ? {
        found: !!foundUrl,
        foundExact: !!foundUrlExact,
        matchedUrl: foundUrl,
        matchedUrlExact: foundUrlExact,
      } : null,
      articlesExample,
      allUrls: gscUrls, // 全URL一覧（デバッグ用）
      rawGscData: {
        rowsCount: gscData.rows?.length || 0,
        responseAggregationType: gscData.responseAggregationType,
      },
    });
  } catch (error: any) {
    console.error("Error in list-test:", error);
    return NextResponse.json(
      { 
        error: error.message || "テスト実行に失敗しました",
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

