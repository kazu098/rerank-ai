import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlanByName } from "@/lib/db/plans";
import { getUserById, updateUserPlan } from "@/lib/db/users";

/**
 * 7日間無料トライアルを開始（非推奨）
 * 
 * 注意: このエンドポイントはクレジットカード不要でトライアルを開始しますが、
 * Stripeの無料トライアル機能（subscription_data.trial_period_days）を使用する方が
 * 一般的なベストプラクティスに沿っています。
 * 
 * 新しい実装では、/api/billing/checkout に trial: true を渡すことで
 * Stripeの無料トライアル機能を使用します（クレジットカード登録が必要）。
 * 
 * POST /api/billing/trial
 * Body: { planName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { planName } = body;

    if (!planName) {
      return NextResponse.json(
        { error: "planName is required" },
        { status: 400 }
      );
    }

    // スタータープランのみトライアル可能
    if (planName !== "starter") {
      return NextResponse.json(
        { error: "Trial is only available for starter plan" },
        { status: 400 }
      );
    }

    // プランを取得
    const plan = await getPlanByName(planName);
    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    // ユーザー情報を取得
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 既にトライアル中または有料プランに加入している場合はエラー
    if (user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
      return NextResponse.json(
        { error: "Trial is already active" },
        { status: 400 }
      );
    }

    if (user.plan_id && user.plan_id !== plan.id && user.plan_started_at) {
      return NextResponse.json(
        { error: "You already have an active subscription" },
        { status: 400 }
      );
    }

    // トライアル期間を設定（7日間）
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // ユーザーのプランを更新（トライアル中はスタータープランの機能を使用）
    await updateUserPlan(session.userId, plan.id, new Date(), trialEndsAt, trialEndsAt);

    // trial_ends_atも更新（別途更新が必要な場合）
    // ここではupdateUserPlanでplan_ends_atに設定しているが、
    // 必要に応じてtrial_ends_atも更新する

    return NextResponse.json({
      success: true,
      message: "Trial started successfully",
      trialEndsAt: trialEndsAt.toISOString(),
    });
  } catch (error: any) {
    console.error("[Trial API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to start trial",
      },
      { status: 500 }
    );
  }
}

