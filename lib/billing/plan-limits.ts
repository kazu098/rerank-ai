import { getUserById } from "@/lib/db/users";
import { getPlanById, isPlanLimitExceeded, checkPlanLimit } from "@/lib/db/plans";
import { getArticlesByUserId } from "@/lib/db/articles";
import { createSupabaseClient } from "@/lib/supabase";

export interface PlanLimitCheckResult {
  allowed: boolean;
  reason?: string; // 翻訳キーまたはメッセージ
  currentUsage: number;
  limit: number | null;
  limitType?: string; // 翻訳時に使用
}

/**
 * プランの制限をチェック
 */
export async function checkUserPlanLimit(
  userId: string,
  limitType: "articles" | "analyses" | "concurrent_analyses" | "article_suggestions"
): Promise<PlanLimitCheckResult> {
  // プラン制限を一時的に無効化（リリース前の開発用）
  // 環境変数 ENABLE_PLAN_LIMITS=true で有効化可能（デフォルトは無効）
  if (process.env.ENABLE_PLAN_LIMITS !== 'true') {
    return {
      allowed: true,
      currentUsage: 0,
      limit: null,
    };
  }

  const user = await getUserById(userId);
  if (!user || !user.plan_id) {
    return {
      allowed: false,
      reason: "errors.planNotSet",
      currentUsage: 0,
      limit: null,
    };
  }

  const plan = await getPlanById(user.plan_id);
  if (!plan) {
    return {
      allowed: false,
      reason: "errors.planNotFound",
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
    case "analyses": {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const supabase = createSupabaseClient();
      // analysis_runsはarticle_id経由でユーザーを特定する必要がある
      const { data: analyses } = await supabase
        .from("analysis_runs")
        .select(`
          id,
          article:articles!inner(user_id)
        `)
        .gte("created_at", startOfMonth.toISOString())
        .lte("created_at", endOfMonth.toISOString());

      // ユーザーIDでフィルタリング
      const userAnalyses = analyses?.filter(
        (analysis: any) => analysis.article?.user_id === userId
      ) || [];

      currentUsage = userAnalyses.length;
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
      ? "errors.limitExceeded"
      : undefined,
    currentUsage,
    limit,
    limitType, // 翻訳時に使用するため追加
  };
}

/**
 * トライアル期間中かチェック
 * フリープランの場合は常にfalseを返す（トライアルは有料プランのみ）
 */
export async function isTrialActive(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user || !user.plan_id) {
    return false;
  }

  // フリープランの場合はトライアル期間をチェックしない
  const plan = await getPlanById(user.plan_id);
  if (plan && plan.name === "free") {
    return false;
  }

  // トライアル期間が設定されていない場合はfalse
  if (!user.trial_ends_at) {
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

