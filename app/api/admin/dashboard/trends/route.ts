import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";
import { getPlanById } from "@/lib/db/plans";

/**
 * 管理画面ダッシュボード用の時系列データを取得
 * GET /api/admin/dashboard/trends?period=daily|weekly|monthly
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
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "daily"; // daily, weekly, monthly

    const now = new Date();
    let startDate: Date;
    let dataPoints: number;

    if (period === "daily") {
      // 過去30日間の日次データ
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      dataPoints = 30;
    } else if (period === "weekly") {
      // 過去12週間の週次データ
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 12 * 7);
      dataPoints = 12;
    } else {
      // 過去12ヶ月の月次データ
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 12);
      dataPoints = 12;
    }

    // ユーザー登録数の時系列データ
    const userTrends: Array<{ date: string; count: number; cumulative: number }> = [];
    const analysisTrends: Array<{ date: string; count: number }> = [];
    const mrrTrends: Array<{ date: string; mrr: number; cumulative: number }> = [];

    // 累計計算用の変数
    let cumulativeUsers = 0;

    // 開始日時点での累計を取得
    const { count: initialUserCount } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .lt("created_at", startDate.toISOString());
    cumulativeUsers = initialUserCount || 0;

    for (let i = dataPoints - 1; i >= 0; i--) {
      let periodStart: Date;
      let periodEnd: Date;

      if (period === "daily") {
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - i);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setHours(23, 59, 59, 999);
      } else if (period === "weekly") {
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - (i + 1) * 7);
        periodStart.setDate(periodStart.getDate() - periodStart.getDay()); // 週の開始（日曜日）
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 6);
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        // monthly
        periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      }

      // ユーザー登録数
      const { count: userCount } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());

      cumulativeUsers += userCount || 0;

      userTrends.push({
        date: period === "daily"
          ? periodStart.toISOString().split("T")[0]
          : period === "weekly"
          ? `${periodStart.toISOString().split("T")[0]}`
          : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`,
        count: userCount || 0,
        cumulative: cumulativeUsers,
      });

      // 分析実行数
      const { count: analysisCount } = await supabase
        .from("analysis_runs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());

      analysisTrends.push({
        date: period === "daily"
          ? periodStart.toISOString().split("T")[0]
          : period === "weekly"
          ? `${periodStart.toISOString().split("T")[0]}`
          : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`,
        count: analysisCount || 0,
      });

      // MRR計算（全期間で計算）
      // この期間終了時点でアクティブな全サブスクリプションのMRRを計算
      const { data: activeUsersWithPlans } = await supabase
        .from("users")
        .select("plan_id, plan_started_at, plan_ends_at")
        .is("deleted_at", null)
        .not("plan_id", "is", null);

      let totalMrrAtPeriodEnd = 0;
      let newMrrInPeriod = 0;
      
      if (activeUsersWithPlans) {
        for (const user of activeUsersWithPlans) {
          if (user.plan_id) {
            const plan = await getPlanById(user.plan_id);
            if (plan && plan.name !== "free" && plan.price_monthly) {
              const planStarted = user.plan_started_at
                ? new Date(user.plan_started_at)
                : null;
              const planEnds = user.plan_ends_at ? new Date(user.plan_ends_at) : null;

              // この期間終了時点でアクティブだったかチェック
              const isActiveAtPeriodEnd =
                (!planStarted || planStarted <= periodEnd) &&
                (!planEnds || planEnds >= periodEnd);

              if (isActiveAtPeriodEnd) {
                totalMrrAtPeriodEnd += plan.price_monthly;
                
                // この期間中に新規に開始されたサブスクリプションをカウント
                if (planStarted && planStarted >= periodStart && planStarted <= periodEnd) {
                  newMrrInPeriod += plan.price_monthly;
                }
              }
            }
          }
        }
      }

      const dateLabel = period === "daily"
        ? periodStart.toISOString().split("T")[0]
        : period === "weekly"
        ? `${periodStart.toISOString().split("T")[0]}`
        : `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;

      mrrTrends.push({
        date: dateLabel,
        mrr: newMrrInPeriod,
        cumulative: totalMrrAtPeriodEnd,
      });
    }

    return NextResponse.json({
      period,
      trends: {
        users: userTrends,
        analyses: analysisTrends,
        mrr: mrrTrends.length > 0 ? mrrTrends : undefined,
      },
    });
  } catch (error: any) {
    console.error("[Admin Dashboard Trends] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      {
        error: error.message || getErrorMessage(locale, "errors.trendsDataFetchFailed"),
      },
      { status: 500 }
    );
  }
}
