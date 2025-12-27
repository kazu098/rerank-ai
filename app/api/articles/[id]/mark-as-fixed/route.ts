import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleById } from "@/lib/db/articles";
import { createSupabaseClient } from "@/lib/supabase";

/**
 * 記事を修正済みにする
 * POST /api/articles/[id]/mark-as-fixed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const { id } = params;
    const userId = session.userId as string;

    // 記事を取得して所有権を確認
    const article = await getArticleById(id);

    if (!article) {
      return NextResponse.json(
        { error: "記事が見つかりません。" },
        { status: 404 }
      );
    }

    if (article.user_id !== userId) {
      return NextResponse.json(
        { error: "アクセス権限がありません。" },
        { status: 403 }
      );
    }

    // 修正済みフラグを更新
    const supabase = createSupabaseClient();
    const { error } = await supabase
      .from("articles")
      .update({
        is_fixed: true,
        fixed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to mark article as fixed: ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Articles API] Error:", error);
    return NextResponse.json(
      { error: error.message || "修正済みフラグの更新に失敗しました。" },
      { status: 500 }
    );
  }
}

