import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseClient } from "@/lib/supabase";

/**
 * 詳細分析データを取得
 * GET /api/analysis/detailed?storageKey=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const storageKey = searchParams.get("storageKey");

    if (!storageKey) {
      return NextResponse.json(
        { error: "storageKeyが必要です。" },
        { status: 400 }
      );
    }

    // 有効期限をチェック
    const supabase = createSupabaseClient();
    const { data: result, error: resultError } = await supabase
      .from("analysis_results")
      .select("detailed_result_expires_at")
      .eq("detailed_result_storage_key", storageKey)
      .single();

    if (resultError || !result) {
      return NextResponse.json(
        { error: "分析結果が見つかりません。" },
        { status: 404 }
      );
    }

    if (!result.detailed_result_expires_at) {
      return NextResponse.json(
        { error: "詳細データの有効期限情報が見つかりません。" },
        { status: 404 }
      );
    }

    const expiresAt = new Date(result.detailed_result_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: "詳細データの有効期限が切れています。" },
        { status: 410 }
      );
    }

    // Vercel Blob Storageから取得（URLから直接fetch）
    const response = await fetch(storageKey);

    if (!response.ok) {
      return NextResponse.json(
        { error: "詳細データの取得に失敗しました。" },
        { status: 500 }
      );
    }

    const detailedData = await response.json();

    return NextResponse.json(detailedData);
  } catch (error: any) {
    console.error("[Analysis Detailed API] Error:", error);
    return NextResponse.json(
      { error: error.message || "詳細データの取得に失敗しました。" },
      { status: 500 }
    );
  }
}

