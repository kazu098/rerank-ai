import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getUserById, updateStripeSubscriptionId, updateUserPlan } from "@/lib/db/users";
import { getPlanByName, findPlanByStripePriceId } from "@/lib/db/plans";
import Stripe from "stripe";

/**
 * チェックアウトセッションを検証してプランを更新
 * POST /api/billing/verify-session
 * Body: { sessionId: string }
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
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    
    // セッションを取得
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // セッションのユーザーIDが現在のユーザーと一致するか確認
    const userId = checkoutSession.metadata?.userId;
    if (userId !== session.userId) {
      return NextResponse.json(
        { error: "Session does not belong to current user" },
        { status: 403 }
      );
    }

    const planName = checkoutSession.metadata?.planName;
    if (!planName) {
      return NextResponse.json(
        { error: "Plan name not found in session metadata" },
        { status: 400 }
      );
    }

    // ユーザーを取得
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
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

    // サブスクリプションIDを保存
    if (checkoutSession.subscription) {
      const subscriptionId = typeof checkoutSession.subscription === 'string'
        ? checkoutSession.subscription
        : checkoutSession.subscription.id;
      
      await updateStripeSubscriptionId(session.userId, subscriptionId);

      // サブスクリプション情報を取得してプランを更新
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subscriptionData = subscription as any;
        const currentPeriodStart = subscriptionData.current_period_start;
        const currentPeriodEnd = subscriptionData.current_period_end;
        const trialEnd = subscriptionData.trial_end; // トライアル終了日（Unix timestamp）
        
        const planStartedAt = currentPeriodStart
          ? new Date(currentPeriodStart * 1000)
          : new Date();
        const planEndsAt = currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        // トライアル期間がある場合、trial_ends_atを設定
        const trialEndsAt = trialEnd ? new Date(trialEnd * 1000) : null;

        await updateUserPlan(session.userId, plan.id, planStartedAt, planEndsAt, trialEndsAt);
      } catch (error: any) {
        console.error(`[Verify Session] Failed to retrieve subscription:`, error.message);
        // サブスクリプション取得に失敗した場合でも、デフォルト値でプランを更新
        const planStartedAt = new Date();
        const planEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await updateUserPlan(session.userId, plan.id, planStartedAt, planEndsAt, undefined);
      }
    } else {
      // サブスクリプションがまだ作成されていない場合（非同期処理）
      const planStartedAt = new Date();
      const planEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await updateUserPlan(session.userId, plan.id, planStartedAt, planEndsAt, undefined);
    }

    return NextResponse.json({
      success: true,
      planName: planName,
      planId: plan.id,
    });
  } catch (error: any) {
    console.error("[Verify Session] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to verify session",
      },
      { status: 500 }
    );
  }
}

