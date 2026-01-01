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

    // サブスクリプションをキャンセル（即座にキャンセル）
    await stripe.subscriptions.cancel(user.stripe_subscription_id);

    return NextResponse.json({
      success: true,
      message: "Subscription cancelled successfully. You will be moved to the free plan at the end of the current billing period.",
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

