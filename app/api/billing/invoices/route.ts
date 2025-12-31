import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe/client";
import { getUserById } from "@/lib/db/users";

/**
 * 請求履歴を取得
 * GET /api/billing/invoices
 */
export async function GET(request: NextRequest) {
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
      return NextResponse.json({
        invoices: [],
      });
    }

    const stripe = getStripeClient();
    const invoices = await stripe.invoices.list({
      customer: user.stripe_customer_id,
      limit: 12, // 直近12件
    });

    const formattedInvoices = invoices.data.map((invoice) => ({
      id: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      created: invoice.created,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
      description: invoice.description || invoice.lines.data[0]?.description || "",
    }));

    return NextResponse.json({
      invoices: formattedInvoices,
    });
  } catch (error: any) {
    console.error("[Invoices API] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch invoices",
      },
      { status: 500 }
    );
  }
}

