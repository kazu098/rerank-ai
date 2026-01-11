import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ArticleSuggestionGenerator } from "@/lib/article-suggestion";
import { getArticlesBySiteId } from "@/lib/db/articles";
import { saveArticleSuggestions, deletePendingSuggestionsBySiteId } from "@/lib/db/article-suggestions";
import { getSitesByUserId } from "@/lib/db/sites";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事提案を生成
 * POST /api/article-suggestions/generate
 * Body: { siteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { session, locale } = await getSessionAndLocale(request);
    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const userId = session.userId as string;
    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json(
        { error: "siteId is required" },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(userId);
    const site = sites.find((s) => s.id === siteId);

    if (!site) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
    }

    if (!site.site_url) {
      return NextResponse.json(
        { error: "Site URL is not set" },
        { status: 400 }
      );
    }

    // 既存記事を取得
    const existingArticles = await getArticlesBySiteId(siteId);

    // 既存の未着手（pending）の提案を削除（重複を防ぐため）
    await deletePendingSuggestionsBySiteId(userId, siteId);

    // 記事提案を生成
    const generator = new ArticleSuggestionGenerator();
    const suggestions = await generator.generateSuggestions(
      site.site_url,
      userId,
      siteId,
      existingArticles
    );

    // DBに保存
    const savedSuggestions = await saveArticleSuggestions(
      userId,
      siteId,
      suggestions
    );

    return NextResponse.json({
      success: true,
      suggestions: savedSuggestions,
      count: savedSuggestions.length,
    });
  } catch (error: any) {
    console.error("Error generating article suggestions:", error);
    
    const { locale: errorLocale } = await getSessionAndLocale(request);
    
    // キーワードが取得できない場合の特別なエラーハンドリング
    if (error.message === "NO_KEYWORDS_FOUND") {
      return NextResponse.json(
        { 
          error: "NO_KEYWORDS_FOUND",
          message: getErrorMessage(errorLocale, "errors.noKeywordsFound")
        },
        { status: 400 }
      );
    }
    
    // ギャップキーワードがない場合の特別なエラーハンドリング
    if (error.message === "NO_GAP_KEYWORDS_FOUND") {
      return NextResponse.json(
        { 
          error: "NO_GAP_KEYWORDS_FOUND",
          message: getErrorMessage(errorLocale, "errors.noGapKeywordsFound")
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to generate article suggestions" },
      { status: 500 }
    );
  }
}

