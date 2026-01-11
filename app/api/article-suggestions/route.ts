import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleSuggestionsByUserId } from "@/lib/db/article-suggestions";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事提案一覧を取得
 * GET /api/article-suggestions?siteId=...
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

    const userId = session.userId as string;
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status") as
      | "pending"
      | "in_progress"
      | "completed"
      | "skipped"
      | null;

    const suggestions = await getArticleSuggestionsByUserId(
      userId,
      siteId || undefined,
      status || undefined
    );

    return NextResponse.json({
      success: true,
      suggestions,
      count: suggestions.length,
    });
  } catch (error: any) {
    console.error("Error getting article suggestions:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get article suggestions" },
      { status: 500 }
    );
  }
}

