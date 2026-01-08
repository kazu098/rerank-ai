import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseClient } from "@/lib/supabase";

/**
 * 管理画面用の分析実行履歴を取得（ページネーション対応）
 * GET /api/admin/analyses?page=1&pageSize=20
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
    const { count: totalAnalyses } = await supabase
      .from("analysis_runs")
      .select("id", { count: "exact", head: true });

    const total = totalAnalyses || 0;
    const totalPages = Math.ceil(total / pageSize);

    // ページネーション
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize - 1;

    // 分析実行履歴を取得
    const { data: analyses, error } = await supabase
      .from("analysis_runs")
      .select(`
        id,
        created_at,
        article:articles!inner(id, url, title, user_id)
      `)
      .order("created_at", { ascending: false })
      .range(startIndex, endIndex);

    if (error) {
      throw new Error(`Failed to get analyses: ${error.message}`);
    }

    return NextResponse.json({
      analyses: analyses || [],
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error: any) {
    console.error("[Admin Analyses] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "分析実行履歴の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
