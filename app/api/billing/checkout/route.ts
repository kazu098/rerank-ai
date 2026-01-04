import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getPlanByName, getPlanStripePriceId } from "@/lib/db/plans";
import { getUserById, updateStripeCustomerId } from "@/lib/db/users";
import { Currency, detectCurrencyFromLocale, isValidCurrency } from "@/lib/billing/currency";
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
    const { planName, currency, locale: requestLocale } = body;

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

    // ロケールを決定（優先順位: リクエストのロケール > Refererのロケール > ユーザーロケール > Accept-Language）
    let urlLocale: string | null = requestLocale || null;
    
    // RefererヘッダーからURLロケールを取得（リクエストにロケールが含まれていない場合）
    if (!urlLocale) {
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          const pathSegments = refererUrl.pathname.split('/').filter(Boolean);
          if (pathSegments.length > 0 && (pathSegments[0] === 'ja' || pathSegments[0] === 'en')) {
            urlLocale = pathSegments[0];
          }
        } catch (e) {
          // URL解析に失敗した場合は無視
        }
      }
    }
    
    const acceptLanguage = request.headers.get('accept-language');
    
    // ロケールを決定（優先順位: リクエストロケール > Refererロケール > ユーザーロケール > Accept-Language）
    const finalLocale = urlLocale || user.locale || null;
    
    // 通貨を決定（優先順位: クライアントから明示的に指定された通貨 > ロケールから判定）
    let selectedCurrency: Currency;
    if (currency && isValidCurrency(currency)) {
      selectedCurrency = currency;
    } else {
      selectedCurrency = detectCurrencyFromLocale({
        explicitCurrency: null,
        userLocale: finalLocale,
        acceptLanguage: acceptLanguage || null,
      });
    }

    // プランのStripe Price IDを取得（通貨指定）
    const stripePriceId = getPlanStripePriceId(plan, selectedCurrency);
    
    if (!stripePriceId) {
      console.error(`[Checkout API] Price ID not found: plan=${planName}, currency=${selectedCurrency}`);
      console.error(`[Checkout API] Available price IDs:`, {
        test: plan.stripe_price_ids_test,
        live: plan.stripe_price_ids_live,
      });
      return NextResponse.json(
        { 
          error: `Stripe Price ID not found for currency: ${selectedCurrency}. Please configure Stripe Price IDs in the database.`,
          debug: {
            planName,
            currency: selectedCurrency,
            priceIds: {
              test: plan.stripe_price_ids_test,
              live: plan.stripe_price_ids_live,
            },
          },
        },
        { status: 400 }
      );
    }
    
    const stripe = getStripeClient();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const locale = finalLocale || user.locale || "ja";

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
    // Stripe公式ドキュメント: https://stripe.com/docs/api/checkout/sessions/create
    // - price: 通貨を含むPrice IDを指定（各通貨ごとに異なるPrice ID）
    // - locale: 決済ページの言語設定（"ja", "en", "auto"など）
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: stripePriceId, // 通貨が含まれたPrice ID（例: JPY用price_xxx, USD用price_yyy）
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/${locale}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${locale}/?canceled=true#pricing`,
      metadata: {
        userId: user.id,
        planName: planName,
        currency: selectedCurrency,
        priceId: stripePriceId, // デバッグ用: 使用したPrice IDを保存
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planName: planName,
          currency: selectedCurrency, // 通貨情報も保存
        },
      },
      // Stripe Checkoutのロケール設定
      // https://stripe.com/docs/api/checkout/sessions/create#create_checkout_session-locale
      // "auto"でStripeがブラウザ言語を自動判定、"ja"で日本語固定
      locale: locale === "ja" ? "ja" : "auto",
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

