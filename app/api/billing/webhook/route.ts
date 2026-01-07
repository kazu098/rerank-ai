import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe/client";
import { getUserById, updateStripeCustomerId, updateStripeSubscriptionId, updateUserPlan } from "@/lib/db/users";
import { getPlanByName, findPlanByStripePriceId } from "@/lib/db/plans";
import Stripe from "stripe";

/**
 * Stripe Webhook処理
 * POST /api/billing/webhook
 */
export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

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
    console.log(`[Webhook] Received event type: ${event.type}`);
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Webhook] checkout.session.completed - session ID: ${session.id}, metadata:`, session.metadata);
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Webhook] customer.subscription.created - subscription ID: ${subscription.id}, metadata:`, subscription.metadata);
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

  console.log(`[Webhook] handleCheckoutSessionCompleted - userId: ${userId}, planName: ${planName}, subscription:`, session.subscription);

  if (!userId || !planName) {
    console.error("[Webhook] Missing metadata in checkout session", { userId, planName, metadata: session.metadata });
    return;
  }

  // サブスクリプションIDを保存
  if (session.subscription) {
    const subscriptionId = typeof session.subscription === 'string' 
      ? session.subscription 
      : session.subscription.id;
    
    await updateStripeSubscriptionId(userId, subscriptionId);

    // サブスクリプション情報を取得してプランを更新
    const stripe = getStripeClient();
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
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
      const subscriptionData = subscription as any;
      const currentPeriodStart = subscriptionData.current_period_start;
      const currentPeriodEnd = subscriptionData.current_period_end;
      const trialEnd = subscriptionData.trial_end; // トライアル終了日（Unix timestamp）
      
      const planStartedAt = currentPeriodStart 
        ? new Date(currentPeriodStart * 1000)
        : new Date();
      const planEndsAt = currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30日後をデフォルト
      
      // トライアル期間がある場合、trial_ends_atを設定
      const trialEndsAt = trialEnd ? new Date(trialEnd * 1000) : null;

      await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt, trialEndsAt);
      console.log(`[Webhook] Plan updated for user ${userId}: ${planName} (from checkout.session.completed), planId: ${plan.id}, startedAt: ${planStartedAt}, endsAt: ${planEndsAt}, trialEndsAt: ${trialEndsAt}`);
    } catch (error: any) {
      console.error(`[Webhook] Failed to retrieve subscription ${subscriptionId}:`, error.message, error);
      // エラーが発生した場合でも、プランを更新を試みる（セッションメタデータを使用）
      await updatePlanFromSessionMetadata(userId, planName);
    }
  } else {
    // サブスクリプションがまだ作成されていない場合（非同期処理）
    // セッションのメタデータから直接プランを更新
    console.log(`[Webhook] Subscription not yet created, updating plan from session metadata`);
    await updatePlanFromSessionMetadata(userId, planName);
  }
}

/**
 * セッションのメタデータからプランを更新（フォールバック処理）
 */
async function updatePlanFromSessionMetadata(userId: string, planName: string) {
  try {
    console.log(`[Webhook] updatePlanFromSessionMetadata - userId: ${userId}, planName: ${planName}`);
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

    // デフォルトの日付でプランを更新（サブスクリプション情報が取得できない場合）
    const planStartedAt = new Date();
    const planEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30日後

    console.log(`[Webhook] Updating user plan - userId: ${userId}, planId: ${plan.id}, planName: ${planName}, startedAt: ${planStartedAt}, endsAt: ${planEndsAt}`);
    await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt);
    console.log(`[Webhook] Plan updated successfully for user ${userId}: ${planName} (from session metadata fallback)`);
  } catch (error: any) {
    console.error(`[Webhook] Failed to update plan from session metadata:`, error.message, error);
    throw error; // エラーを再スローして、呼び出し元で確認できるようにする
  }
}

/**
 * サブスクリプション作成時の処理
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  let planName = subscription.metadata?.planName;

  console.log(`[Webhook] handleSubscriptionCreated - subscription ID: ${subscription.id}, userId: ${userId}, planName: ${planName}, metadata:`, subscription.metadata);

  if (!userId) {
    console.error("[Webhook] Missing userId in subscription metadata");
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    console.error(`[Webhook] User not found: ${userId}`);
    return;
  }

  // プラン名を特定（metadataから、またはPrice IDから）
  let plan = null;
  
  if (planName) {
    plan = await getPlanByName(planName);
  }

  // metadataにplanNameがない場合、Price IDからプランを特定
  if (!plan) {
    const currentPriceId = subscription.items.data[0]?.price?.id;
    if (currentPriceId) {
      console.log(`[Webhook] Plan name not found in metadata, trying to find from Price ID: ${currentPriceId}`);
      plan = await findPlanByStripePriceId(currentPriceId);
      if (plan) {
        planName = plan.name;
        console.log(`[Webhook] Found plan from Price ID: ${planName} (${currentPriceId})`);
      }
    }
  }

  if (!plan) {
    console.error(`[Webhook] Plan not found. userId: ${userId}, planName: ${planName}, subscription ID: ${subscription.id}`);
    return;
  }

  // サブスクリプションIDを保存
  await updateStripeSubscriptionId(userId, subscription.id);

  // ユーザーのプランを更新
  const subscriptionData = subscription as any;
  const currentPeriodStart = subscriptionData.current_period_start;
  const currentPeriodEnd = subscriptionData.current_period_end;
  const trialEnd = subscriptionData.trial_end; // トライアル終了日（Unix timestamp）
  
  const planStartedAt = currentPeriodStart
    ? new Date(currentPeriodStart * 1000)
    : new Date();
  const planEndsAt = currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30日後をデフォルト
  
  // トライアル期間がある場合、trial_ends_atを設定
  const trialEndsAt = trialEnd ? new Date(trialEnd * 1000) : null;

  await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt, trialEndsAt);
  console.log(`[Webhook] Plan updated for user ${userId}: ${planName} (subscription.created), planId: ${plan.id}, startedAt: ${planStartedAt}, endsAt: ${planEndsAt}, trialEndsAt: ${trialEndsAt}`);
}

/**
 * サブスクリプション更新時の処理
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
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

  // プラン名を特定（metadataから、またはPrice IDから）
  let planName = subscription.metadata?.planName;
  let plan = null;

  if (planName) {
    // metadataにplanNameがある場合はそれを使用
    plan = await getPlanByName(planName);
  } else {
    // metadataにplanNameがない場合（Customer Portal経由で変更した場合など）
    // Price IDからプラン名を特定
    const currentPriceId = subscription.items.data[0]?.price?.id;
    if (currentPriceId) {
      plan = await findPlanByStripePriceId(currentPriceId);
      if (plan) {
        planName = plan.name;
        console.log(`[Webhook] Found plan from Price ID: ${planName} (${currentPriceId})`);
      }
    }
  }

  if (!plan) {
    console.error(`[Webhook] Plan not found. planName: ${planName}, subscription ID: ${subscription.id}`);
    return;
  }

  // ユーザーのプランを更新
  const subscriptionData = subscription as any;
  const currentPeriodStart = subscriptionData.current_period_start;
  const currentPeriodEnd = subscriptionData.current_period_end;
  const trialEnd = subscriptionData.trial_end; // トライアル終了日（Unix timestamp）
  
  const planStartedAt = currentPeriodStart
    ? new Date(currentPeriodStart * 1000)
    : new Date();
  const planEndsAt = currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30日後をデフォルト
  
  // トライアル期間がある場合、trial_ends_atを設定（トライアルが終了している場合はnull）
  const trialEndsAt = trialEnd && trialEnd * 1000 > Date.now() ? new Date(trialEnd * 1000) : null;

  // 新しいプランが現在のプランと異なる場合、pending_plan_idをクリア（アップグレード時など）
  // ダウングレード時は既にpending_plan_idが設定されているので、ここではクリアしない
  const shouldClearPendingPlan = user.plan_id !== plan.id && user.pending_plan_id;
  const pendingPlanIdToSet = shouldClearPendingPlan ? null : undefined;

  await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt, trialEndsAt, pendingPlanIdToSet);
  console.log(`[Webhook] Plan updated for user ${userId}: ${planName}, trialEndsAt: ${trialEndsAt}, pendingPlanCleared: ${shouldClearPendingPlan}`);
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

  // 無料プランに変更（pending_plan_idもクリア）
  const subscriptionData = subscription as any; // Stripe型定義の互換性のため
  const planEndsAt = new Date(subscriptionData.current_period_end * 1000);
  await updateUserPlan(userId, freePlan.id, new Date(), planEndsAt, undefined, null);
}

/**
 * 請求書の支払い成功時の処理
 * 期間終了時にpending_plan_idがある場合、それを適用する
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const invoiceData = invoice as any; // Stripe型定義の互換性のため
  const subscriptionId = typeof invoiceData.subscription === 'string' 
    ? invoiceData.subscription 
    : invoiceData.subscription?.id;

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

  const user = await getUserById(userId);
  if (!user) {
    console.error(`[Webhook] User not found: ${userId}`);
    return;
  }

  // プラン期間を更新
  const subscriptionData = subscription as any;
  const currentPeriodEnd = subscriptionData.current_period_end;
  
  const planEndsAt = currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30日後をデフォルト

  // pending_plan_idがある場合、期間終了時に適用（ダウングレード時など）
  if (user.pending_plan_id) {
    console.log(`[Webhook] Applying pending plan - userId: ${userId}, pendingPlanId: ${user.pending_plan_id}`);
    
    // pending_plan_idをplan_idに適用
    await updateUserPlan(
      userId,
      user.pending_plan_id,
      new Date(),
      planEndsAt,
      undefined, // trialEndsAt
      null // pending_plan_idをクリア
    );
    
    console.log(`[Webhook] Pending plan applied - userId: ${userId}, newPlanId: ${user.pending_plan_id}`);
  } else {
    // pending_plan_idがない場合、現在のプランを更新
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

