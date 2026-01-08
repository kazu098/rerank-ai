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
      const supabase = createSupabaseClient();
      
      // Freeプランの場合は累計、それ以外は月間
      if (plan.name === "free") {
        // 累計分析回数を取得
        const { data: analyses } = await supabase
          .from("analysis_runs")
          .select(`
            id,
            article:articles!inner(user_id)
          `);

        // ユーザーIDでフィルタリング
        const userAnalyses = analyses?.filter(
          (analysis: any) => analysis.article?.user_id === userId
        ) || [];

        currentUsage = userAnalyses.length;
      } else {
        // 月間分析回数を取得
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

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
      }
      break;
    }
    case "article_suggestions": {
      const supabase = createSupabaseClient();
      
      // Freeプランの場合は累計、それ以外は月間
      if (plan.name === "free") {
        // 累計提案回数（ユニークなgeneration_idの数）を取得
        const { data: generations, error } = await supabase
          .from("article_suggestions")
          .select("generation_id")
          .eq("user_id", userId);

        if (error) {
          console.error("[Plan Limits] Error fetching article suggestions:", error);
          currentUsage = 0;
        } else {
          // ユニークなgeneration_idの数をカウント
          const uniqueGenerations = new Set(
            (generations || []).map((g) => g.generation_id).filter((id) => id !== null)
          );
          currentUsage = uniqueGenerations.size;
        }
      } else {
        // 月間提案回数（ユニークなgeneration_idの数）を取得
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const { data: generations, error } = await supabase
          .from("article_suggestions")
          .select("generation_id")
          .eq("user_id", userId)
          .gte("created_at", startOfMonth.toISOString())
          .lte("created_at", endOfMonth.toISOString());

        if (error) {
          console.error("[Plan Limits] Error fetching article suggestions:", error);
          currentUsage = 0;
        } else {
          // ユニークなgeneration_idの数をカウント
          const uniqueGenerations = new Set(
            (generations || []).map((g) => g.generation_id).filter((id) => id !== null)
          );
          currentUsage = uniqueGenerations.size;
        }
      }
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

