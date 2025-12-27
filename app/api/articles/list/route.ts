import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGSCClient } from "@/lib/gsc-api";
import { getSitesByUserId, getSiteById } from "@/lib/db/sites";
import { getArticlesBySiteId, getArticleByUrl } from "@/lib/db/articles";

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
    const gscUrls = (gscData.rows || []).map((row) => {
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
      return {
        url: fullUrl,
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
      };
    });

    // DBの記事とGSCのURLをマージ
    // DBにタイトルがある場合はそれを使用、ない場合はnull
    const mergedArticles = gscUrls.map((gscUrl) => {
      const dbArticle = dbArticles.find((a) => a.url === gscUrl.url);
      return {
        url: gscUrl.url,
        title: dbArticle?.title || null,
        impressions: gscUrl.impressions,
        clicks: gscUrl.clicks,
        position: gscUrl.position,
        hasTitleInDb: !!dbArticle?.title,
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

