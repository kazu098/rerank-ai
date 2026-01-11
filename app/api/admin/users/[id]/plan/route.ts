import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getUserById, updateUserPlan } from "@/lib/db/users";
import { getPlanByName } from "@/lib/db/plans";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 管理者によるユーザーのプラン変更
 * POST /api/admin/users/[id]/plan
 * Body: { planName: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 管理者権限チェック
    if (!await requireAdmin()) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { planName } = body;

    if (!planName) {
      return NextResponse.json(
        { error: "planName is required" },
        { status: 400 }
      );
    }

    // ユーザー情報を取得
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 新しいプランを取得
    const newPlan = await getPlanByName(planName);
    if (!newPlan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    // 現在のプランと新しいプランが同じかチェック
    if (user.plan_id === newPlan.id) {
      return NextResponse.json(
        { error: "User is already on this plan" },
        { status: 400 }
      );
    }

    // プランを更新（管理者による手動変更のため、即座に変更）
    const now = new Date();
    await updateUserPlan(
      id,
      newPlan.id,
      now, // plan_started_at
      null, // plan_ends_at (無制限)
      null, // trial_ends_at
      null  // pending_plan_id
    );

    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json({
      success: true,
      message: getErrorMessage(locale, "billing.planChangeSuccess"),
      user: {
        id: user.id,
        email: user.email,
        plan_id: newPlan.id,
        plan_name: newPlan.name,
      },
    });
  } catch (error: any) {
    console.error("[Admin User Plan Change] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      {
        error: error.message || getErrorMessage(locale, "billing.planChangeFailed"),
      },
      { status: 500 }
    );
  }
}
