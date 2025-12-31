import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getUserById } from "@/lib/db/users";

/**
 * Stripe Customer PortalのURLを取得
 * POST /api/billing/customer-portal
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

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (!user.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer ID not found" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const locale = user.locale || "ja";

    // Customer Portalセッションを作成
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/${locale}/dashboard/billing`,
      locale: locale === "ja" ? "ja" : "en",
    });

    return NextResponse.json({
      success: true,
      url: portalSession.url,
    });
  } catch (error: any) {
    console.error("[Customer Portal API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create customer portal session",
      },
      { status: 500 }
    );
  }
}

