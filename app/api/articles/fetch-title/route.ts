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

    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error("[Fetch Title] Failed to parse request body:", parseError);
      return NextResponse.json(
        { error: "リクエストボディのパースに失敗しました", details: parseError.message },
        { status: 400 }
      );
    }

    const { articleId, url, siteUrl } = body;

    let article;
    let siteId: string | null = null;

    // articleIdが提供されている場合（記事一覧からの呼び出し）
    if (articleId) {
      try {
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
        
        // siteIdがnullの場合でも続行可能（URLで直接取得する場合）
        if (siteId) {
          const site = await getSiteById(siteId);
          if (!site) {
            console.warn(`[Fetch Title] Site not found for siteId: ${siteId}, continuing without site validation`);
          }
        }
      } catch (dbError: any) {
        console.error("[Fetch Title] Error fetching article by ID:", dbError);
        return NextResponse.json(
          { error: "記事の取得に失敗しました", details: dbError.message },
          { status: 500 }
        );
      }
    } else if (url && siteUrl) {
      // 後方互換性のため、url + siteUrlでも動作する
      try {
        const sites = await getSitesByUserId(session.userId as string);
        const site = sites.find((s) => s.site_url === siteUrl);

        if (!site) {
          return NextResponse.json(
            { error: "サイトが見つかりません" },
            { status: 404 }
          );
        }

        siteId = site.id;
      } catch (dbError: any) {
        console.error("[Fetch Title] Error fetching sites:", dbError);
        return NextResponse.json(
          { error: "サイトの取得に失敗しました", details: dbError.message },
          { status: 500 }
        );
      }
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
    let content;
    try {
      content = await scraper.scrapeArticle(targetUrl, false);
    } catch (scrapeError: any) {
      // 404エラーの場合、特別な処理を行う
      const errorMessage = scrapeError.message || String(scrapeError);
      if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
        console.warn(`[Fetch Title] Article URL returned 404: ${targetUrl}`);
        return NextResponse.json(
          {
            error: "記事が見つかりません（404エラー）。URLが移動または削除された可能性があります。",
            code: "ARTICLE_NOT_FOUND",
            url: targetUrl,
          },
          { status: 404 }
        );
      }
      // その他のエラーは再スロー
      throw scrapeError;
    }

    // DBに保存（タイトルを更新）
    let updatedArticle;
    try {
      const { saveOrUpdateArticle } = await import("@/lib/db/articles");
      updatedArticle = await saveOrUpdateArticle(
        session.userId as string,
        targetUrl,
        siteId,
        content.title
      );
    } catch (dbError: any) {
      console.error("[Fetch Title] Error saving article:", dbError);
      // タイトルの取得は成功しているので、DB保存に失敗してもタイトルを返す
      return NextResponse.json({
        url: targetUrl,
        title: content.title,
        warning: "タイトルは取得できましたが、データベースへの保存に失敗しました",
        error: dbError.message,
      });
    }

    return NextResponse.json({
      url: targetUrl,
      title: content.title,
      articleId: updatedArticle?.id || null,
    });
  } catch (error: any) {
    console.error("[Fetch Title] Error fetching article title:", error);
    console.error("[Fetch Title] Error stack:", error.stack);
    
    // 既に404エラーの場合はそのまま返す
    if (error.code === "ARTICLE_NOT_FOUND") {
      return NextResponse.json(
        {
          error: error.error || "記事が見つかりません",
          code: error.code,
          url: error.url,
        },
        { status: 404 }
      );
    }
    
    // エラーの詳細を返す（開発環境でのみ）
    const errorMessage = error.message || "タイトルの取得に失敗しました";
    const errorDetails = process.env.NODE_ENV === "development" 
      ? { message: errorMessage, stack: error.stack, error: String(error) }
      : { message: errorMessage };
    
    return NextResponse.json(
      { error: errorMessage, ...errorDetails },
      { status: 500 }
    );
  } finally {
    if (scraper) {
      try {
        await scraper.close();
      } catch (closeError) {
        console.error("[Fetch Title] Error closing scraper:", closeError);
      }
    }
  }
}

