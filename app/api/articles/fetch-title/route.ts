import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ArticleScraper } from "@/lib/article-scraper";
import { getSitesByUserId } from "@/lib/db/sites";

/**
 * 個別記事のタイトルを取得
 * POST /api/articles/fetch-title
 * Body: { articleId: string } または { url: string, siteUrl: string } (後方互換性のため)
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
    const { articleId, url, siteUrl } = body;

    let article;
    let siteId: string | null = null;

    // articleIdが提供されている場合（記事一覧からの呼び出し）
    if (articleId) {
      const { getArticleById } = await import("@/lib/db/articles");
      const { getSiteById } = await import("@/lib/db/sites");
      
      article = await getArticleById(articleId);
      if (!article) {
        return NextResponse.json(
          { error: "記事が見つかりません" },
          { status: 404 }
        );
      }

      // 記事の所有者を確認
      if (article.user_id !== session.userId) {
        return NextResponse.json(
          { error: "アクセス権限がありません" },
          { status: 403 }
        );
      }

      siteId = article.site_id;
    } else if (url && siteUrl) {
      // 後方互換性のため、url + siteUrlでも動作する
      const sites = await getSitesByUserId(session.userId as string);
      const site = sites.find((s) => s.site_url === siteUrl);

      if (!site) {
        return NextResponse.json(
          { error: "サイトが見つかりません" },
          { status: 404 }
        );
      }

      siteId = site.id;
    } else {
      return NextResponse.json(
        { error: "articleIdまたはurlとsiteUrlパラメータが必要です" },
        { status: 400 }
      );
    }

    const targetUrl = article?.url || url;
    if (!targetUrl) {
      return NextResponse.json(
        { error: "URLが取得できませんでした" },
        { status: 400 }
      );
    }

    // タイトルを取得
    scraper = new ArticleScraper();
    const content = await scraper.scrapeArticle(targetUrl, false);

    // DBに保存（タイトルを更新）
    const { saveOrUpdateArticle } = await import("@/lib/db/articles");
    const updatedArticle = await saveOrUpdateArticle(
      session.userId as string,
      targetUrl,
      siteId,
      content.title
    );

    return NextResponse.json({
      url: targetUrl,
      title: content.title,
      articleId: updatedArticle.id,
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

