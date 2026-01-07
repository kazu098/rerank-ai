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
      expand: ['data.subscription'], // サブスクリプション情報も取得（デバッグ用）
    });

    // デバッグログ: 取得した請求書の情報を確認
    console.log(`[Invoices API] Fetched invoices for customer ${user.stripe_customer_id}:`, {
      total: invoices.data.length,
      invoiceIds: invoices.data.map(inv => inv.id),
      statuses: invoices.data.map(inv => inv.status),
      hasHostedUrl: invoices.data.map(inv => !!inv.hosted_invoice_url),
      hasPdf: invoices.data.map(inv => !!inv.invoice_pdf),
    });

    const formattedInvoices = invoices.data.map((invoice) => {
      // デバッグログ: 各請求書の詳細情報
      console.log(`[Invoices API] Invoice ${invoice.id}:`, {
        status: invoice.status,
        amount_paid: invoice.amount_paid,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
        finalized: invoice.status === 'paid' || invoice.status === 'open',
      });

      return {
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
      };
    });

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

