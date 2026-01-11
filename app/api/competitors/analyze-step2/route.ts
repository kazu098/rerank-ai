import { NextRequest, NextResponse } from "next/server";
import { analyzeStep2 } from "@/lib/competitor-analysis-step2";
import { Step1Result } from "@/lib/competitor-analysis";
import { getSessionAndLocale } from "@/lib/api-helpers";

/**
 * Step 2: 競合URL抽出
 * POST /api/competitors/analyze-step2
 * Body: { siteUrl: string, pageUrl: string, prioritizedKeywords: Step1Result["prioritizedKeywords"], maxCompetitorsPerKeyword?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      prioritizedKeywords,
      maxCompetitorsPerKeyword = 10,
    } = body;

    if (!siteUrl || !pageUrl || !prioritizedKeywords) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl, prioritizedKeywords" },
        { status: 400 }
      );
    }

    const apiStartTime = Date.now();
    console.log(
      `[API] ⏱️ Step 2 starting for ${siteUrl}${pageUrl}, ${prioritizedKeywords.length} keywords at ${new Date().toISOString()}`
    );

    // localeを取得
    const { locale } = await getSessionAndLocale(request);

    const result = await analyzeStep2(
      siteUrl,
      pageUrl,
      prioritizedKeywords,
      maxCompetitorsPerKeyword,
      locale
    );

    const apiTotalTime = Date.now() - apiStartTime;
    console.log(
      `[API] ⏱️ Step 2 complete: ${apiTotalTime}ms (${(apiTotalTime / 1000).toFixed(2)}s), ${result.competitorResults.length} keyword results, ${result.uniqueCompetitorUrls.length} unique competitor URLs`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in Step 2:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze step 2" },
      { status: 500 }
    );
  }
}


