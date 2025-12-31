import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getPlanByName, getPlanStripePriceId } from "@/lib/db/plans";
import { getUserById, updateStripeCustomerId } from "@/lib/db/users";
import { Currency, getCurrencyFromLocale, isValidCurrency } from "@/lib/billing/currency";
import Stripe from "stripe";

/**
 * チェックアウトセッションを作成
 * POST /api/billing/checkout
 * Body: { planName: string, currency?: string }
 * 
 * currencyが指定されていない場合は、ユーザーのロケールから自動判定
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
    const { planName, currency } = body;

    if (!planName) {
      return NextResponse.json(
        { error: "planName is required" },
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

    // 通貨を判定（指定されていない場合はロケールから自動判定）
    let selectedCurrency: Currency;
    if (currency && isValidCurrency(currency)) {
      selectedCurrency = currency;
    } else {
      selectedCurrency = getCurrencyFromLocale(user.locale || "ja");
    }

    // プランのStripe Price IDを取得（通貨指定）
    const stripePriceId = getPlanStripePriceId(plan, selectedCurrency);
    if (!stripePriceId) {
      return NextResponse.json(
        { error: `Stripe Price ID not found for currency: ${selectedCurrency}. Please configure Stripe Price IDs in the database.` },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const locale = user.locale || "ja";

    // Stripe Customerを作成または取得
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      // 新規Customer作成
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
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/${locale}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${locale}/pricing?canceled=true`,
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
      // 日本語対応
      locale: locale === "ja" ? "ja" : "en",
    });

    return NextResponse.json({
      success: true,
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error: any) {
    console.error("[Checkout API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create checkout session",
      },
      { status: 500 }
    );
  }
}

