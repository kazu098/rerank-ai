import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleById } from "@/lib/db/articles";
import { createSupabaseClient } from "@/lib/supabase";

/**
 * 記事の監視ステータスを切り替え
 * POST /api/articles/[id]/monitoring
 * Body: { enabled: boolean }
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
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }

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

    // 監視ステータスを更新
    const supabase = createSupabaseClient();
    const { error } = await supabase
      .from("articles")
      .update({
        is_monitoring: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to update monitoring status: ${error.message}`);
    }

    return NextResponse.json({ success: true, is_monitoring: enabled });
  } catch (error: any) {
    console.error("[Articles API] Error:", error);
    return NextResponse.json(
      { error: error.message || "監視ステータスの更新に失敗しました。" },
      { status: 500 }
    );
  }
}

