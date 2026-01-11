import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleById } from "@/lib/db/articles";
import { createSupabaseClient } from "@/lib/supabase";
import { checkUserPlanLimit } from "@/lib/billing/plan-limits";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

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
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
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

    // 監視をONにする場合のみプラン制限をチェック
    if (enabled && !article.is_monitoring) {
      const limitCheck = await checkUserPlanLimit(userId, "articles");
      if (!limitCheck.allowed) {
        return NextResponse.json(
          { 
            error: limitCheck.reason || "errors.articlesLimitExceeded",
            errorKey: limitCheck.reason || "errors.articlesLimitExceeded",
            limitExceeded: true,
            limitType: "articles",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            upgradeRequired: true
          },
          { status: 403 }
        );
      }
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
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.monitoringStatusUpdateFailed") },
      { status: 500 }
    );
  }
}

