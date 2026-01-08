import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getPlanById } from "@/lib/db/plans";

/**
 * 管理画面用のユーザー一覧を取得（ページネーション対応）
 * GET /api/admin/users?page=1&pageSize=20
 */
export async function GET(request: NextRequest) {
  try {
    // 管理者権限チェック
    if (!await requireAdmin()) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const supabase = createSupabaseClient();
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    // 総件数を取得
    const { count: totalUsers } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    const total = totalUsers || 0;
    const totalPages = Math.ceil(total / pageSize);

    // ページネーション
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize - 1;

    // ユーザー一覧を取得
    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, name, created_at, provider, plan_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(startIndex, endIndex);

    if (error) {
      throw new Error(`Failed to get users: ${error.message}`);
    }

    // プラン情報を追加
    const usersWithPlans = await Promise.all(
      (users || []).map(async (user) => {
        let planName = "free";
        if (user.plan_id) {
          const plan = await getPlanById(user.plan_id);
          planName = plan?.name || "free";
        }
        return {
          ...user,
          planName,
        };
      })
    );

    return NextResponse.json({
      users: usersWithPlans,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error: any) {
    console.error("[Admin Users] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "ユーザー一覧の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
