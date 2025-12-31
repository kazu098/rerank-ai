import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/client";
import { getUserById, updateStripeCustomerId, updateStripeSubscriptionId, updateUserPlan } from "@/lib/db/users";
import { getPlanByName } from "@/lib/db/plans";
import Stripe from "stripe";

/**
 * Stripe Webhook処理
 * POST /api/billing/webhook
 */
export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[Webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: any) {
    console.error("[Webhook] Signature verification failed:", error.message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${error.message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[Webhook] Error processing event:", error);
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * チェックアウトセッション完了時の処理
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const planName = session.metadata?.planName;

  if (!userId || !planName) {
    console.error("[Webhook] Missing metadata in checkout session");
    return;
  }

  // サブスクリプションIDを保存
  if (session.subscription) {
    await updateStripeSubscriptionId(userId, session.subscription as string);
  }
}

/**
 * サブスクリプション作成時の処理
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const planName = subscription.metadata?.planName;

  if (!userId || !planName) {
    console.error("[Webhook] Missing metadata in subscription");
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    console.error(`[Webhook] User not found: ${userId}`);
    return;
  }

  const plan = await getPlanByName(planName);
  if (!plan) {
    console.error(`[Webhook] Plan not found: ${planName}`);
    return;
  }

  // サブスクリプションIDを保存
  await updateStripeSubscriptionId(userId, subscription.id);

  // ユーザーのプランを更新
  const planStartedAt = new Date(subscription.current_period_start * 1000);
  const planEndsAt = new Date(subscription.current_period_end * 1000);

  await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt);
}

/**
 * サブスクリプション更新時の処理
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const planName = subscription.metadata?.planName;

  if (!userId || !planName) {
    console.error("[Webhook] Missing metadata in subscription");
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    console.error(`[Webhook] User not found: ${userId}`);
    return;
  }

  const plan = await getPlanByName(planName);
  if (!plan) {
    console.error(`[Webhook] Plan not found: ${planName}`);
    return;
  }

  // ユーザーのプランを更新
  const planStartedAt = new Date(subscription.current_period_start * 1000);
  const planEndsAt = new Date(subscription.current_period_end * 1000);

  await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt);
}

/**
 * サブスクリプション削除時の処理（解約）
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error("[Webhook] Missing userId in subscription metadata");
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    console.error(`[Webhook] User not found: ${userId}`);
    return;
  }

  // 無料プランに戻す
  const freePlan = await getPlanByName("free");
  if (!freePlan) {
    console.error("[Webhook] Free plan not found");
    return;
  }

  // サブスクリプションIDをクリア
  await updateStripeSubscriptionId(userId, null);

  // 無料プランに変更（現在の期間の終了日まで有効）
  const planEndsAt = new Date(subscription.current_period_end * 1000);
  await updateUserPlan(userId, freePlan.id, new Date(), planEndsAt);
}

/**
 * 請求書の支払い成功時の処理
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  // サブスクリプション情報を取得
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const userId = subscription.metadata?.userId;
  if (!userId) {
    return;
  }

  // プラン期間を更新
  const planEndsAt = new Date(subscription.current_period_end * 1000);
  const user = await getUserById(userId);
  if (user) {
    await updateUserPlan(user.plan_id!, user.plan_id!, new Date(), planEndsAt);
  }
}

/**
 * 請求書の支払い失敗時の処理
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`[Webhook] Payment failed for invoice: ${invoice.id}`);
  // 必要に応じてユーザーに通知を送信
  // ここではログのみ出力
}

