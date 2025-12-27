import { NextRequest, NextResponse } from "next/server";
import { analyzeStep3 } from "@/lib/competitor-analysis-step3";
import { Step1Result, Step2Result } from "@/lib/competitor-analysis";

/**
 * Step 3: 記事スクレイピング + LLM分析
 * POST /api/competitors/analyze-step3
 * Body: { siteUrl: string, pageUrl: string, prioritizedKeywords: Step1Result["prioritizedKeywords"], competitorResults: Step2Result["competitorResults"], uniqueCompetitorUrls: Step2Result["uniqueCompetitorUrls"], skipLLMAnalysis?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      prioritizedKeywords,
      competitorResults,
      uniqueCompetitorUrls,
      skipLLMAnalysis = false,
    } = body;

    if (!siteUrl || !pageUrl || !prioritizedKeywords || !competitorResults || !uniqueCompetitorUrls) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl, prioritizedKeywords, competitorResults, uniqueCompetitorUrls" },
        { status: 400 }
      );
    }

    const apiStartTime = Date.now();
    console.log(
      `[API] ⏱️ Step 3 starting for ${siteUrl}${pageUrl}, ${uniqueCompetitorUrls.length} competitor URLs at ${new Date().toISOString()}`
    );

    // 環境変数でLLM分析をスキップする設定を確認
    const shouldSkipLLM = skipLLMAnalysis || process.env.SKIP_LLM_ANALYSIS === "true";

    const result = await analyzeStep3(
      siteUrl,
      pageUrl,
      prioritizedKeywords,
      competitorResults,
      uniqueCompetitorUrls,
      shouldSkipLLM
    );

    const apiTotalTime = Date.now() - apiStartTime;
    console.log(
      `[API] ⏱️ Step 3 complete: ${apiTotalTime}ms (${(apiTotalTime / 1000).toFixed(2)}s)`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in Step 3:", error);
    
    // Vercelのタイムアウトエラーを検出
    if (error.message?.includes("timeout") || error.message?.includes("Task timed out")) {
      return NextResponse.json(
        { 
          error: "処理がタイムアウトしました。分析に時間がかかりすぎています。",
          hint: "skipLLMAnalysisをtrueに設定するか、しばらく時間をおいて再度お試しください。"
        },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to analyze step 3" },
      { status: 500 }
    );
  }
}


