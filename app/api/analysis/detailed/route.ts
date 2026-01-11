import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 詳細分析データを取得
 * GET /api/analysis/detailed?storageKey=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const storageKey = searchParams.get("storageKey");

    if (!storageKey) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.storageKeyRequired") },
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
        { error: getErrorMessage(locale, "errors.analysisResultNotFound") },
        { status: 404 }
      );
    }

    if (!result.detailed_result_expires_at) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.detailedDataExpiryInfoNotFound") },
        { status: 404 }
      );
    }

    const expiresAt = new Date(result.detailed_result_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.detailedDataExpired") },
        { status: 410 }
      );
    }

    // Vercel Blob Storageから取得（URLから直接fetch）
    const response = await fetch(storageKey);

    if (!response.ok) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.detailedDataFetchFailed") },
        { status: 500 }
      );
    }

    const detailedData = await response.json();

    return NextResponse.json(detailedData);
  } catch (error: any) {
    console.error("[Analysis Detailed API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.detailedDataFetchFailed") },
      { status: 500 }
    );
  }
}

