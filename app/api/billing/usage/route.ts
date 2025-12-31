import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticlesByUserId } from "@/lib/db/articles";
import { getSitesByUserId } from "@/lib/db/sites";
import { createSupabaseClient } from "@/lib/supabase";

/**
 * 使用状況を取得
 * GET /api/billing/usage
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseClient();

    // 監視中の記事数を取得
    const articles = await getArticlesByUserId(session.userId);
    const monitoringArticles = articles.filter((article) => article.is_monitoring);

    // GSC連携サイト数を取得
    const sites = await getSitesByUserId(session.userId);

    // 今月の分析回数を取得
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // analysis_runsはarticle_id経由でユーザーを特定する必要がある
    const { data: analyses, error: analysesError } = await supabase
      .from("analysis_runs")
      .select(`
        id,
        article:articles!inner(user_id)
      `)
      .gte("created_at", startOfMonth.toISOString())
      .lte("created_at", endOfMonth.toISOString());

    if (analysesError) {
      console.error("[Usage API] Error fetching analyses:", analysesError);
    }

    // ユーザーIDでフィルタリング
    const userAnalyses = analyses?.filter(
      (analysis: any) => analysis.article?.user_id === session.userId
    ) || [];

    // 今月の新規記事提案回数を取得
    const { data: suggestions, error: suggestionsError } = await supabase
      .from("article_suggestions")
      .select("id")
      .eq("user_id", session.userId)
      .gte("created_at", startOfMonth.toISOString())
      .lte("created_at", endOfMonth.toISOString());

    if (suggestionsError) {
      console.error("[Usage API] Error fetching suggestions:", suggestionsError);
    }

    const usage = {
      articles: monitoringArticles.length,
      analyses_this_month: userAnalyses.length,
      sites: sites.length,
      article_suggestions_this_month: suggestions?.length || 0,
    };

    return NextResponse.json({
      success: true,
      usage,
    });
  } catch (error: any) {
    console.error("[Usage API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch usage",
      },
      { status: 500 }
    );
  }
}

