import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticlesByUserId } from "@/lib/db/articles";
import { getUserById } from "@/lib/db/users";
import { getPlanById } from "@/lib/db/plans";
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

    // プラン情報を取得してFreeプランかどうかを判定
    const user = await getUserById(session.userId);
    let isFreePlan = false;
    if (user?.plan_id) {
      const plan = await getPlanById(user.plan_id);
      isFreePlan = plan?.name === "free";
    }

    // 今月の開始日と終了日を取得（新規記事提案回数の取得で使用）
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Freeプランの場合は累計、それ以外は月間の分析回数を取得
    let userAnalyses: any[] = [];
    if (isFreePlan) {
      // 累計分析回数を取得
      const { data: analyses, error: analysesError } = await supabase
        .from("analysis_runs")
        .select(`
          id,
          article:articles!inner(user_id)
        `);

      if (analysesError) {
        console.error("[Usage API] Error fetching analyses:", analysesError);
      }

      // ユーザーIDでフィルタリング
      userAnalyses = analyses?.filter(
        (analysis: any) => analysis.article?.user_id === session.userId
      ) || [];
    } else {
      // 今月の分析回数を取得
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
      userAnalyses = analyses?.filter(
        (analysis: any) => analysis.article?.user_id === session.userId
      ) || [];
    }

    // 新規記事提案回数を取得（Freeプランは累計、それ以外は月間）
    // ユニークなgeneration_idの数をカウント（1回のAPI呼び出し = 1回のカウント）
    let articleSuggestionsCount = 0;
    if (isFreePlan) {
      // 累計提案回数（ユニークなgeneration_idの数）を取得
      const { data: generations, error: suggestionsError } = await supabase
        .from("article_suggestions")
        .select("generation_id")
        .eq("user_id", session.userId);

      if (suggestionsError) {
        console.error("[Usage API] Error fetching suggestions:", suggestionsError);
      } else {
        // ユニークなgeneration_idの数をカウント
        const uniqueGenerations = new Set(
          (generations || []).map((g) => g.generation_id).filter((id) => id !== null)
        );
        articleSuggestionsCount = uniqueGenerations.size;
      }
    } else {
      // 今月の提案回数（ユニークなgeneration_idの数）を取得
      const { data: generations, error: suggestionsError } = await supabase
        .from("article_suggestions")
        .select("generation_id")
        .eq("user_id", session.userId)
        .gte("created_at", startOfMonth.toISOString())
        .lte("created_at", endOfMonth.toISOString());

      if (suggestionsError) {
        console.error("[Usage API] Error fetching suggestions:", suggestionsError);
      } else {
        // ユニークなgeneration_idの数をカウント
        const uniqueGenerations = new Set(
          (generations || []).map((g) => g.generation_id).filter((id) => id !== null)
        );
        articleSuggestionsCount = uniqueGenerations.size;
      }
    }

    const usage = {
      articles: monitoringArticles.length,
      analyses_this_month: userAnalyses.length,
      article_suggestions_this_month: articleSuggestionsCount,
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

