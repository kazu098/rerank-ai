import { getUserById } from "@/lib/db/users";
import { getPlanById, isPlanLimitExceeded, checkPlanLimit } from "@/lib/db/plans";
import { getArticlesByUserId } from "@/lib/db/articles";
import { getSitesByUserId } from "@/lib/db/sites";
import { createSupabaseClient } from "@/lib/supabase";

export interface PlanLimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number | null;
}

/**
 * プランの制限をチェック
 */
export async function checkUserPlanLimit(
  userId: string,
  limitType: "articles" | "analyses" | "sites" | "concurrent_analyses" | "article_suggestions"
): Promise<PlanLimitCheckResult> {
  const user = await getUserById(userId);
  if (!user || !user.plan_id) {
    return {
      allowed: false,
      reason: "プランが設定されていません",
      currentUsage: 0,
      limit: null,
    };
  }

  const plan = await getPlanById(user.plan_id);
  if (!plan) {
    return {
      allowed: false,
      reason: "プランが見つかりません",
      currentUsage: 0,
      limit: null,
    };
  }

  // 現在の使用量を取得
  let currentUsage = 0;

  switch (limitType) {
    case "articles": {
      const articles = await getArticlesByUserId(userId);
      currentUsage = articles.filter((article) => article.is_monitoring).length;
      break;
    }
    case "sites": {
      const sites = await getSitesByUserId(userId);
      currentUsage = sites.length;
      break;
    }
    case "analyses": {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const supabase = createSupabaseClient();
      const { data: analyses } = await supabase
        .from("analysis_runs")
        .select("id")
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString())
        .lte("created_at", endOfMonth.toISOString());

      currentUsage = analyses?.length || 0;
      break;
    }
    case "article_suggestions": {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const supabase = createSupabaseClient();
      const { data: suggestions } = await supabase
        .from("article_suggestions")
        .select("id")
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString())
        .lte("created_at", endOfMonth.toISOString());

      currentUsage = suggestions?.length || 0;
      break;
    }
    case "concurrent_analyses": {
      // 同時実行数は別途チェックが必要（実行中の分析数をカウント）
      // ここでは簡易的に0を返す
      currentUsage = 0;
      break;
    }
  }

  const limit = checkPlanLimit(plan, limitType);
  const exceeded = isPlanLimitExceeded(plan, limitType, currentUsage);

  return {
    allowed: !exceeded,
    reason: exceeded
      ? `${limitType}の制限（${limit}）に達しています。プランをアップグレードしてください。`
      : undefined,
    currentUsage,
    limit,
  };
}

/**
 * トライアル期間中かチェック
 */
export async function isTrialActive(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user || !user.trial_ends_at) {
    return false;
  }

  return new Date(user.trial_ends_at) > new Date();
}

/**
 * ユーザーが有料プランに加入しているかチェック
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user || !user.plan_id) {
    return false;
  }

  const plan = await getPlanById(user.plan_id);
  if (!plan) {
    return false;
  }

  // 無料プラン以外は有料プランとみなす
  return plan.name !== "free";
}

