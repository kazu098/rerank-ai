import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleById } from "@/lib/db/articles";
import { createSupabaseClient } from "@/lib/supabase";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事を修正済みにする
 * POST /api/articles/[id]/mark-as-fixed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const { id } = params;
    const userId = session.userId as string;

    // 記事を取得して所有権を確認
    const article = await getArticleById(id);

    if (!article) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.articleNotFound") },
        { status: 404 }
      );
    }

    if (article.user_id !== userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.accessDenied") },
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
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.markAsFixedFailed") },
      { status: 500 }
    );
  }
}

