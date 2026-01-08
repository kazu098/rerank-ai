import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getPlanById } from "@/lib/db/plans";

/**
 * 管理画面ダッシュボード用の統計データを取得
 * GET /api/admin/dashboard/stats
 */
export async function GET(request: NextRequest) {
  try {
    // 管理者権限チェック
    if (!await requireAdmin()) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const supabase = createSupabaseClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // 今週の日曜日
    startOfWeek.setHours(0, 0, 0, 0);

    // 1. ユーザー関連統計
    const { count: totalUsers } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    const { count: newUsersToday } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", startOfToday.toISOString());

    const { count: newUsersThisWeek } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", startOfWeek.toISOString());

    const { count: newUsersThisMonth } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString());

    const { count: newUsersLastMonth } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", startOfLastMonth.toISOString())
      .lt("created_at", endOfLastMonth.toISOString());

    // 認証方法別の内訳
    const { data: usersByProvider } = await supabase
      .from("users")
      .select("provider")
      .is("deleted_at", null);

    const providerStats = {
      google: usersByProvider?.filter((u) => u.provider === "google").length || 0,
      credentials: usersByProvider?.filter((u) => u.provider === "credentials").length || 0,
    };

    // 2. プラン別ユーザー数
    const { data: usersWithPlans } = await supabase
      .from("users")
      .select("plan_id")
      .is("deleted_at", null);

    const planCounts: Record<string, number> = {};
    if (usersWithPlans) {
      for (const user of usersWithPlans) {
        if (user.plan_id) {
          const plan = await getPlanById(user.plan_id);
          if (plan) {
            planCounts[plan.name] = (planCounts[plan.name] || 0) + 1;
          }
        }
      }
    }

    // 3. 記事関連統計
    const { count: totalArticles } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    const { count: monitoringArticles } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_monitoring", true);

    // 4. 分析実行統計
    const { count: totalAnalyses } = await supabase
      .from("analysis_runs")
      .select("id", { count: "exact", head: true });

    const { count: analysesThisMonth } = await supabase
      .from("analysis_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString());

    const { count: analysesLastMonth } = await supabase
      .from("analysis_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfLastMonth.toISOString())
      .lt("created_at", endOfLastMonth.toISOString());

    // 5. 新規記事提案統計（generation_idベース）
    const { data: allGenerations } = await supabase
      .from("article_suggestions")
      .select("generation_id")
      .not("generation_id", "is", null);

    const uniqueGenerations = new Set(
      (allGenerations || []).map((g) => g.generation_id).filter((id) => id !== null)
    );

    const { data: generationsThisMonth } = await supabase
      .from("article_suggestions")
      .select("generation_id")
      .not("generation_id", "is", null)
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString());

    const uniqueGenerationsThisMonth = new Set(
      (generationsThisMonth || []).map((g) => g.generation_id).filter((id) => id !== null)
    );

    // 6. GSC連携サイト数
    const { count: totalSites } = await supabase
      .from("sites")
      .select("id", { count: "exact", head: true });

    // 7. MRR計算（有料プランのみ）
    const { data: allPlans } = await supabase.from("plans").select("*");
    let mrr = 0;
    const mrrByPlan: Record<string, number> = {};

    if (allPlans && usersWithPlans) {
      for (const plan of allPlans) {
        if (plan.name !== "free" && plan.price_monthly) {
          const planUserCount = usersWithPlans.filter((u) => u.plan_id === plan.id).length;
          const planMrr = planUserCount * plan.price_monthly;
          mrr += planMrr;
          if (planMrr > 0) {
            mrrByPlan[plan.name] = planMrr;
          }
        }
      }
    }

    // 8. 最近のユーザー一覧（新規登録順、最新10件）
    const { data: recentUsers } = await supabase
      .from("users")
      .select("id, email, name, created_at, provider, plan_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    // プラン情報を追加
    const recentUsersWithPlans = await Promise.all(
      (recentUsers || []).map(async (user) => {
        let planName = "free";
        if (user.plan_id) {
          const plan = await getPlanById(user.plan_id);
          planName = plan?.name || "free";
        }
        return {
          ...user,
          planName,
        };
      })
    );

    // 9. 最近の分析実行履歴（最新20件）
    const { data: recentAnalyses } = await supabase
      .from("analysis_runs")
      .select(`
        id,
        created_at,
        article:articles!inner(id, url, title, user_id)
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    // 10. 通知送信統計
    const { count: totalNotifications } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true });

    const { count: notificationsThisMonth } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString());

    // 11. アクティブユーザー数（過去30日以内にログインしたユーザー）
    // 注: 現在はログイン履歴テーブルがないため、暫定的に全ユーザー数を返す
    // 将来的にログイン履歴テーブルを追加する必要がある
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    // 暫定的に、過去30日以内に作成されたユーザーをアクティブユーザーとみなす
    const { count: activeUsers } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo.toISOString());

    // 12. 解約数（今月・先月）
    // 注: 現在は解約履歴テーブルがないため、暫定的に0を返す
    // 将来的に解約履歴テーブルを追加する必要がある
    const cancellationsThisMonth = 0;
    const cancellationsLastMonth = 0;

    // 13. トライアル中ユーザー数
    const { count: trialUsers } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("trial_ends_at", "is", null)
      .gt("trial_ends_at", now.toISOString());

    // 前月比の計算
    const userGrowthRate =
      newUsersLastMonth && newUsersLastMonth > 0
        ? ((newUsersThisMonth || 0) - newUsersLastMonth) / newUsersLastMonth
        : null;

    const analysesGrowthRate =
      analysesLastMonth && analysesLastMonth > 0
        ? ((analysesThisMonth || 0) - analysesLastMonth) / analysesLastMonth
        : null;

    // 解約率の計算（アクティブサブスクリプション数に対する解約数の割合）
    const activeSubscriptions = Object.entries(planCounts)
      .filter(([planName]) => planName !== "free")
      .reduce((sum, [, count]) => sum + count, 0);
    
    const churnRate =
      activeSubscriptions > 0 && cancellationsThisMonth > 0
        ? cancellationsThisMonth / activeSubscriptions
        : null;

    const stats = {
      users: {
        total: totalUsers || 0,
        active: activeUsers || 0, // 過去30日以内
        newToday: newUsersToday || 0,
        newThisWeek: newUsersThisWeek || 0,
        newThisMonth: newUsersThisMonth || 0,
        newLastMonth: newUsersLastMonth || 0,
        growthRate: userGrowthRate,
        byProvider: providerStats,
        recent: recentUsersWithPlans,
      },
      plans: {
        byPlan: planCounts,
      },
      articles: {
        total: totalArticles || 0,
        monitoring: monitoringArticles || 0,
      },
      analyses: {
        total: totalAnalyses || 0,
        thisMonth: analysesThisMonth || 0,
        lastMonth: analysesLastMonth || 0,
        growthRate: analysesGrowthRate,
        recent: recentAnalyses || [],
      },
      articleSuggestions: {
        total: uniqueGenerations.size,
        thisMonth: uniqueGenerationsThisMonth.size,
      },
      sites: {
        total: totalSites || 0,
      },
      revenue: {
        mrr: mrr,
        arr: mrr * 12,
        byPlan: mrrByPlan,
      },
      subscriptions: {
        active: activeSubscriptions,
        cancellationsThisMonth,
        cancellationsLastMonth,
        churnRate,
        trialUsers: trialUsers || 0,
      },
      notifications: {
        total: totalNotifications || 0,
        thisMonth: notificationsThisMonth || 0,
      },
    };

    return NextResponse.json({ stats });
  } catch (error: any) {
    console.error("[Admin Dashboard] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "統計データの取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
