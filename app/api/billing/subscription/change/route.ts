import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getPlanByName, getPlanStripePriceId } from "@/lib/db/plans";
import { getUserById } from "@/lib/db/users";
import { Currency, getCurrencyFromLocale, isValidCurrency } from "@/lib/billing/currency";
import Stripe from "stripe";

/**
 * プランを変更
 * POST /api/billing/subscription/change
 * Body: { planName: string, currency?: string, prorationBehavior?: 'always' | 'none' }
 * 
 * prorationBehavior:
 * - 'always': 即座に変更（差額を請求/返金）
 * - 'none': 期間終了時に変更（差額なし）
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
    const { planName, currency, prorationBehavior = 'always' } = body;

    if (!planName) {
      return NextResponse.json(
        { error: "planName is required" },
        { status: 400 }
      );
    }

    if (prorationBehavior !== 'always' && prorationBehavior !== 'none') {
      return NextResponse.json(
        { error: "prorationBehavior must be 'always' or 'none'" },
        { status: 400 }
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

    if (!user.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    // 新しいプランを取得
    const newPlan = await getPlanByName(planName);
    if (!newPlan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    // 現在のプランと新しいプランが同じかチェック
    if (user.plan_id === newPlan.id) {
      return NextResponse.json(
        { error: "You are already on this plan" },
        { status: 400 }
      );
    }

    // 通貨を判定
    const selectedCurrency: Currency = currency && isValidCurrency(currency)
      ? currency
      : getCurrencyFromLocale(user.locale || "ja");

    // 新しいプランのStripe Price IDを取得
    const newStripePriceId = getPlanStripePriceId(newPlan, selectedCurrency);
    if (!newStripePriceId) {
      return NextResponse.json(
        { error: `Stripe Price ID not found for currency: ${selectedCurrency}. Please configure Stripe Price IDs in the database.` },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();

    // 現在のサブスクリプションを取得
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);

    // サブスクリプションアイテムIDを取得
    const subscriptionItemId = subscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      return NextResponse.json(
        { error: "Subscription item not found" },
        { status: 400 }
      );
    }

    // サブスクリプションを更新
    const updatedSubscription = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newStripePriceId,
          },
        ],
        proration_behavior: prorationBehavior === 'always' ? 'always_invoice' : 'none',
        metadata: {
          userId: user.id,
          planName: planName,
        },
      }
    );

    return NextResponse.json({
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        currentPeriodEnd: updatedSubscription.current_period_end,
      },
    });
  } catch (error: any) {
    console.error("[Plan Change API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to change plan",
      },
      { status: 500 }
    );
  }
}

