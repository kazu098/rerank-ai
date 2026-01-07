import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getUserById } from "@/lib/db/users";

/**
 * サブスクリプションをキャンセル（フリープランに戻る）
 * POST /api/billing/subscription/cancel
 * 
 * サブスクリプションを即座にキャンセルします。
 * Webhook（subscription.deleted）で自動的にフリープランに戻ります。
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

    // ユーザー情報を取得
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // サブスクリプションIDがない場合はエラー
    if (!user.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();

    // サブスクリプションを期間終了時にキャンセル（既に支払った期間を使い切れる）
    // cancel_at_period_end: true により、現在の期間終了まで有料プランが継続
    await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({
      success: true,
      message: "Subscription will be cancelled at the end of the current billing period. You can continue using the paid plan until then.",
    });
  } catch (error: any) {
    console.error("[Cancel Subscription API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to cancel subscription",
      },
      { status: 500 }
    );
  }
}

