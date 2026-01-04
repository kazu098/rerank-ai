import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getPlanByName, getPlanStripePriceId, getPlanPrice, findPlanByStripePriceId } from "@/lib/db/plans";
import { getUserById, updateStripeCustomerId, updateUserPlan } from "@/lib/db/users";
import { Currency, detectCurrencyFromLocale, isValidCurrency } from "@/lib/billing/currency";
import Stripe from "stripe";

/**
 * プランを変更
 * POST /api/billing/subscription/change
 * Body: { planName: string, currency?: string, prorationBehavior?: 'always' | 'none' }
 * 
 * prorationBehavior:
 * - 'always': 即座に変更（差額を請求/返金）
 * - 'none': 期間終了時に変更（差額なし）- デフォルト
 * 
 * フリープランから有料プランに変更する場合は、チェックアウトセッションを作成します。
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
    const { planName, currency, prorationBehavior = 'none' } = body;

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

    // 通貨を自動判定（ロケールベース）
    const acceptLanguage = request.headers.get('accept-language');
    
    const selectedCurrency = detectCurrencyFromLocale({
      explicitCurrency: currency || null,
      userLocale: user.locale || null,
      acceptLanguage: acceptLanguage || null,
    });

    // 新しいプランのStripe Price IDを取得
    const newStripePriceId = getPlanStripePriceId(newPlan, selectedCurrency);
    if (!newStripePriceId) {
      return NextResponse.json(
        { error: `Stripe Price ID not found for currency: ${selectedCurrency}. Please configure Stripe Price IDs in the database.` },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();

    // フリープランから有料プランに変更する場合は、チェックアウトセッションを作成
    if (!user.stripe_subscription_id) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const locale = user.locale || "ja";

      // Stripe Customerを作成または取得
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;
        await updateStripeCustomerId(user.id, customerId);
      }

      // チェックアウトセッションを作成
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [
          {
            price: newStripePriceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/${locale}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/${locale}/dashboard/billing?canceled=true`,
        metadata: {
          userId: user.id,
          planName: planName,
          currency: selectedCurrency,
        },
        subscription_data: {
          metadata: {
            userId: user.id,
            planName: planName,
          },
        },
        locale: locale === "ja" ? "ja" : "en",
      });

      return NextResponse.json({
        success: true,
        requiresCheckout: true,
        url: checkoutSession.url,
        sessionId: checkoutSession.id,
      });
    }

    // 既存のサブスクリプションがある場合は、サブスクリプションを更新
    // 現在のサブスクリプションを取得
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);

    // 現在のサブスクリプションのPrice IDを取得して通貨を判定
    const currentPriceId = subscription.items.data[0]?.price?.id;
    if (!currentPriceId) {
      return NextResponse.json(
        { error: "Current subscription price not found" },
        { status: 400 }
      );
    }

    // 現在のPrice情報を取得して通貨を確認
    const currentPrice = await stripe.prices.retrieve(currentPriceId);
    const currentCurrency = currentPrice.currency.toUpperCase() as Currency;

    // 既存のサブスクリプションと同じ通貨のPrice IDを使用
    const stripePriceIdForChange = getPlanStripePriceId(newPlan, currentCurrency);
    if (!stripePriceIdForChange) {
      return NextResponse.json(
        { error: `Stripe Price ID not found for currency: ${currentCurrency}. Please configure Stripe Price IDs in the database.` },
        { status: 400 }
      );
    }

    // 現在のプランを取得（価格比較のため）
    const currentPlanFromPrice = await findPlanByStripePriceId(currentPriceId);
    if (!currentPlanFromPrice) {
      return NextResponse.json(
        { error: "Current plan not found from price ID" },
        { status: 400 }
      );
    }

    // プランの価格を比較してアップグレードかダウングレードかを判定
    let effectiveProrationBehavior: 'always_invoice' | 'none';
    let changeType: 'upgrade' | 'downgrade' | 'same';
    
    if (currentPlanFromPrice.id === newPlan.id) {
      changeType = 'same';
      effectiveProrationBehavior = 'none';
    } else {
      // 現在のプランと新しいプランの価格を比較
      const currentPlanPrice = getPlanPrice(currentPlanFromPrice, currentCurrency);
      const newPlanPrice = getPlanPrice(newPlan, currentCurrency);
      
      if (newPlanPrice > currentPlanPrice) {
        // アップグレード: 即座に変更（比例計算で差額を請求）
        changeType = 'upgrade';
        effectiveProrationBehavior = 'always_invoice';
      } else if (newPlanPrice < currentPlanPrice) {
        // ダウングレード: 期間終了時に変更（差額を返金しない）
        changeType = 'downgrade';
        effectiveProrationBehavior = 'none';
      } else {
        // 同じ価格: 期間終了時に変更
        changeType = 'same';
        effectiveProrationBehavior = 'none';
      }
    }

    // ユーザーが明示的にprorationBehaviorを指定した場合は、それを使用（オプション）
    // ただし、ベストプラクティスに基づいた自動判定を優先
    const finalProrationBehavior = prorationBehavior === 'always' ? 'always_invoice' : effectiveProrationBehavior;

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
            price: stripePriceIdForChange,
          },
        ],
        proration_behavior: finalProrationBehavior,
        metadata: {
          userId: user.id,
          planName: planName,
        },
      }
    );

    // Stripe型定義の互換性のため
    const subscriptionData = updatedSubscription as any;

    // サブスクリプション更新後、即座にプランを更新（Webhookが届かない場合のフォールバック）
    // Webhookでも更新されるが、即座に反映させるため
    const currentPeriodStart = subscriptionData.current_period_start;
    const currentPeriodEnd = subscriptionData.current_period_end;
    
    const planStartedAt = currentPeriodStart
      ? new Date(currentPeriodStart * 1000)
      : new Date();
    const planEndsAt = currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    try {
      await updateUserPlan(user.id, newPlan.id, planStartedAt, planEndsAt);
      console.log(`[Plan Change API] Plan updated immediately - userId: ${user.id}, planId: ${newPlan.id}, planName: ${planName}`);
    } catch (error: any) {
      console.error(`[Plan Change API] Failed to update user plan immediately:`, error.message);
      // エラーが発生しても、Stripeの更新は完了しているので続行
    }

    return NextResponse.json({
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        currentPeriodEnd: subscriptionData.current_period_end,
      },
      changeType, // 'upgrade' | 'downgrade' | 'same'
      prorationBehavior: finalProrationBehavior, // 'always_invoice' | 'none'
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

