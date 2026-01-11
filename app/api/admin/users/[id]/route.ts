import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getUserById } from "@/lib/db/users";
import { getPlanById } from "@/lib/db/plans";
import { getArticlesByUserId } from "@/lib/db/articles";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 管理画面用のユーザー詳細情報を取得
 * GET /api/admin/users/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 管理者権限チェック
    if (!await requireAdmin()) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;
    const supabase = createSupabaseClient();

    // ユーザー情報を取得
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // プラン情報を取得
    let plan = null;
    if (user.plan_id) {
      plan = await getPlanById(user.plan_id);
    }

    // 記事情報を取得
    const articles = await getArticlesByUserId(id);
    const monitoringArticles = articles.filter((a) => a.is_monitoring);

    // 分析実行回数（今月）
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const { count: analysesThisMonth } = await supabase
      .from("analysis_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString())
      .in(
        "article_id",
        articles.map((a) => a.id)
      );

    // 総分析実行回数
    const { count: totalAnalyses } = await supabase
      .from("analysis_runs")
      .select("id", { count: "exact", head: true })
      .in(
        "article_id",
        articles.map((a) => a.id)
      );

    // 新規記事提案回数（今月、generation_idベース）
    const { data: generationsThisMonth } = await supabase
      .from("article_suggestions")
      .select("generation_id")
      .eq("user_id", id)
      .not("generation_id", "is", null)
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString());

    const uniqueGenerationsThisMonth = new Set(
      (generationsThisMonth || []).map((g) => g.generation_id).filter((id) => id !== null)
    );

    // GSC連携サイト数
    const { count: sitesCount } = await supabase
      .from("sites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        created_at: user.created_at,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              display_name: plan.display_name,
            }
          : null,
        plan_started_at: user.plan_started_at,
        plan_ends_at: user.plan_ends_at,
        trial_ends_at: user.trial_ends_at,
        stripe_customer_id: user.stripe_customer_id,
        stripe_subscription_id: user.stripe_subscription_id,
        locale: user.locale,
        timezone: user.timezone,
      },
      usage: {
        articles: {
          total: articles.length,
          monitoring: monitoringArticles.length,
        },
        analyses: {
          total: totalAnalyses || 0,
          thisMonth: analysesThisMonth || 0,
        },
        articleSuggestions: {
          thisMonth: uniqueGenerationsThisMonth.size,
        },
        sites: sitesCount || 0,
      },
    });
  } catch (error: any) {
    console.error("[Admin User Detail] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      {
        error: error.message || getErrorMessage(locale, "errors.userDetailFetchFailed"),
      },
      { status: 500 }
    );
  }
}
