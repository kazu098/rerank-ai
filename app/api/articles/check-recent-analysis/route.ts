import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleByUrl } from "@/lib/db/articles";

/**
 * 記事が今日既に分析されているかチェック
 * POST /api/articles/check-recent-analysis
 * Body: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "urlパラメータが必要です" },
        { status: 400 }
      );
    }

    // 記事を取得
    const article = await getArticleByUrl(session.userId, url);

    if (!article || !article.last_analyzed_at) {
      return NextResponse.json({
        analyzedToday: false,
      });
    }

    // 今日の日付と比較
    const lastAnalyzed = new Date(article.last_analyzed_at);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lastAnalyzedStart = new Date(
      lastAnalyzed.getFullYear(),
      lastAnalyzed.getMonth(),
      lastAnalyzed.getDate()
    );

    const analyzedToday = lastAnalyzedStart.getTime() === todayStart.getTime();

    return NextResponse.json({
      analyzedToday,
      lastAnalyzedAt: article.last_analyzed_at,
    });
  } catch (error: any) {
    console.error("Error checking recent analysis:", error);
    return NextResponse.json(
      { error: error.message || "チェックに失敗しました" },
      { status: 500 }
    );
  }
}

