import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleById, deleteArticle } from "@/lib/db/articles";
import { getAnalysisResultsByArticleId, getAnalysisRunsByArticleId } from "@/lib/db/analysis-results";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事詳細を取得
 * GET /api/articles/[id]
 */
export async function GET(
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

    const { id } = params;
    const userId = session.userId as string;

    // 記事を取得
    const article = await getArticleById(id);

    if (!article) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.articleNotFound") },
        { status: 404 }
      );
    }

    // ユーザーが所有しているか確認
    if (article.user_id !== userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.accessDenied") },
        { status: 403 }
      );
    }

    // 分析結果履歴を取得
    const analysisResults = await getAnalysisResultsByArticleId(id);
    const analysisRuns = await getAnalysisRunsByArticleId(id);

    return NextResponse.json(
      {
        article,
        analysisResults,
        analysisRuns,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error: any) {
    console.error("[Articles API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.articleFetchFailed") },
      { status: 500 }
    );
  }
}

/**
 * 記事を削除
 * DELETE /api/articles/[id]
 */
export async function DELETE(
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

    const { id } = params;
    const userId = session.userId as string;

    // 記事を取得して所有権を確認
    const article = await getArticleById(id);

    if (!article) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.articleNotFound") },
        { status: 404 }
      );
    }

    if (article.user_id !== userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.accessDenied") },
        { status: 403 }
      );
    }

    // 記事を削除（論理削除）
    await deleteArticle(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Articles API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.articleDeleteFailed") },
      { status: 500 }
    );
  }
}

