import { NextRequest, NextResponse } from "next/server";
import { analyzeStep1 } from "@/lib/competitor-analysis-step1";

/**
 * Step 1: GSCデータ取得 + キーワード選定 + 時系列データ取得
 * POST /api/competitors/analyze-step1
 * Body: { siteUrl: string, pageUrl: string, maxKeywords?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      maxKeywords = 3,
    } = body;

    if (!siteUrl || !pageUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl" },
        { status: 400 }
      );
    }

    const apiStartTime = Date.now();
    console.log(
      `[API] ⏱️ Step 1 starting for ${siteUrl}${pageUrl}, maxKeywords: ${maxKeywords} at ${new Date().toISOString()}`
    );

    const result = await analyzeStep1(siteUrl, pageUrl, maxKeywords);

    const apiTotalTime = Date.now() - apiStartTime;
    console.log(
      `[API] ⏱️ Step 1 complete: ${apiTotalTime}ms (${(apiTotalTime / 1000).toFixed(2)}s)`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in Step 1:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze step 1" },
      { status: 500 }
    );
  }
}

