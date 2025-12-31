import { NextRequest, NextResponse } from "next/server";
import { getAllPlans } from "@/lib/db/plans";

/**
 * プラン一覧を取得
 * GET /api/plans
 */
export async function GET(request: NextRequest) {
  try {
    const plans = await getAllPlans();

    return NextResponse.json({
      success: true,
      plans,
    });
  } catch (error: any) {
    console.error("[Plans API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch plans",
      },
      { status: 500 }
    );
  }
}

