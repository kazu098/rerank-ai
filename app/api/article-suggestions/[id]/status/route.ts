import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateArticleSuggestionStatus } from "@/lib/db/article-suggestions";
import { getArticleSuggestionsByUserId } from "@/lib/db/article-suggestions";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事提案のステータスを更新
 * PATCH /api/article-suggestions/[id]/status
 * Body: { status: "pending" | "in_progress" | "completed" | "skipped" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { session, locale } = await getSessionAndLocale(request);
    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const userId = session.userId as string;
    const { id } = params;
    const body = await request.json();
    const { status } = body;

    if (
      !status ||
      !["pending", "in_progress", "completed", "skipped"].includes(status)
    ) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // ユーザーが所有している提案か確認
    const userSuggestions = await getArticleSuggestionsByUserId(
      userId
    );
    const suggestion = userSuggestions.find((s) => s.id === id);

    if (!suggestion) {
      return NextResponse.json(
        { error: "Suggestion not found" },
        { status: 404 }
      );
    }

    // ステータスを更新
    const updated = await updateArticleSuggestionStatus(id, status);

    return NextResponse.json({
      success: true,
      suggestion: updated,
    });
  } catch (error: any) {
    console.error("Error updating article suggestion status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update suggestion status" },
      { status: 500 }
    );
  }
}

