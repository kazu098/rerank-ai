import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ArticleSuggestionGenerator } from "@/lib/article-suggestion";
import { getArticlesBySiteId } from "@/lib/db/articles";
import { saveArticleSuggestions } from "@/lib/db/article-suggestions";
import { getSitesByUserId } from "@/lib/db/sites";

/**
 * 記事提案を生成
 * POST /api/article-suggestions/generate
 * Body: { siteId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json(
        { error: "siteId is required" },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(session.user.id);
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

    // 記事提案を生成
    const generator = new ArticleSuggestionGenerator();
    const suggestions = await generator.generateSuggestions(
      site.site_url,
      session.user.id,
      siteId,
      existingArticles
    );

    // DBに保存
    const savedSuggestions = await saveArticleSuggestions(
      session.user.id,
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
    return NextResponse.json(
      { error: error.message || "Failed to generate article suggestions" },
      { status: 500 }
    );
  }
}

