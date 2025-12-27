import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ArticleScraper } from "@/lib/article-scraper";
import { saveOrUpdateArticle } from "@/lib/db/articles";
import { getSitesByUserId } from "@/lib/db/sites";

/**
 * 個別記事のタイトルを取得
 * POST /api/articles/fetch-title
 * Body: { url: string, siteUrl: string }
 */
export async function POST(request: NextRequest) {
  let scraper: ArticleScraper | null = null;

  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url, siteUrl } = body;

    if (!url || !siteUrl) {
      return NextResponse.json(
        { error: "urlとsiteUrlパラメータが必要です" },
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

    // タイトルを取得
    scraper = new ArticleScraper();
    const content = await scraper.scrapeArticle(url, false);

    // DBに保存（タイトルを更新）
    const article = await saveOrUpdateArticle(
      session.userId as string,
      url,
      site.id,
      content.title
    );

    return NextResponse.json({
      url,
      title: content.title,
      articleId: article.id,
    });
  } catch (error: any) {
    console.error("Error fetching article title:", error);
    return NextResponse.json(
      { error: error.message || "タイトルの取得に失敗しました" },
      { status: 500 }
    );
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
}

