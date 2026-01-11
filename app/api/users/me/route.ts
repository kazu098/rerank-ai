import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { getPlanById } from "@/lib/db/plans";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 現在のユーザー情報を取得
 * GET /api/users/me
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

    // ユーザー情報を取得
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.userNotFound") },
        { status: 404 }
      );
    }

    // プラン情報を取得
    let plan = null;
    if (user.plan_id) {
      plan = await getPlanById(user.plan_id);
    }

    // pending_plan情報を取得
    let pendingPlan = null;
    if (user.pending_plan_id) {
      pendingPlan = await getPlanById(user.pending_plan_id);
    }

    // 必要な情報のみを返す
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale || "ja",
        timezone: user.timezone || null,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              display_name: plan.display_name,
              price_monthly: plan.price_monthly,
              max_articles: plan.max_articles,
              max_analyses_per_month: plan.max_analyses_per_month,
              max_sites: plan.max_sites,
              max_concurrent_analyses: plan.max_concurrent_analyses,
              max_article_suggestions_per_month: plan.max_article_suggestions_per_month,
              analysis_history_days: plan.analysis_history_days,
            }
          : null,
        pending_plan: pendingPlan
          ? {
              id: pendingPlan.id,
              name: pendingPlan.name,
              display_name: pendingPlan.display_name,
              price_monthly: pendingPlan.price_monthly,
              max_articles: pendingPlan.max_articles,
              max_analyses_per_month: pendingPlan.max_analyses_per_month,
              max_sites: pendingPlan.max_sites,
              max_concurrent_analyses: pendingPlan.max_concurrent_analyses,
              max_article_suggestions_per_month: pendingPlan.max_article_suggestions_per_month,
              analysis_history_days: pendingPlan.analysis_history_days,
            }
          : null,
        plan_started_at: user.plan_started_at,
        plan_ends_at: user.plan_ends_at,
        trial_ends_at: user.trial_ends_at,
        stripe_customer_id: user.stripe_customer_id,
        stripe_subscription_id: user.stripe_subscription_id,
      },
    });
  } catch (error: any) {
    console.error("[Users API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.userFetchFailed") },
      { status: 500 }
    );
  }
}

