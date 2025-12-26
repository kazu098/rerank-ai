import { NextRequest, NextResponse } from "next/server";
import { CompetitorAnalyzer } from "@/lib/competitor-analysis";

/**
 * 順位下落を検知し、主要なキーワードで競合URLを取得
 * POST /api/competitors/analyze
 * Body: { siteUrl: string, pageUrl: string, maxKeywords?: number, maxCompetitorsPerKeyword?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      maxKeywords = 3,
      maxCompetitorsPerKeyword = 10, // 1ページ目（上位10サイト）の上限
      skipLLMAnalysis = false, // LLM分析をスキップするか（タイムアウト回避用）
    } = body;

    if (!siteUrl || !pageUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl" },
        { status: 400 }
      );
    }

    const apiStartTime = Date.now();
    console.log(
      `[API] ⏱️ Starting competitor analysis for ${siteUrl}${pageUrl}, maxKeywords: ${maxKeywords}, maxCompetitorsPerKeyword: ${maxCompetitorsPerKeyword} at ${new Date().toISOString()}`
    );

    const analyzer = new CompetitorAnalyzer();
    
    // 環境変数でLLM分析をスキップする設定を確認
    const shouldSkipLLM = skipLLMAnalysis || process.env.SKIP_LLM_ANALYSIS === "true";
    
    const result = await analyzer.analyzeCompetitors(
      siteUrl,
      pageUrl,
      maxKeywords,
      maxCompetitorsPerKeyword,
      shouldSkipLLM
    );

    const apiTotalTime = Date.now() - apiStartTime;
    console.log(
      `[API] ⏱️ Analysis complete: ${apiTotalTime}ms (${(apiTotalTime / 1000).toFixed(2)}s), ${result.competitorResults.length} keyword results, ${result.uniqueCompetitorUrls.length} unique competitor URLs`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error analyzing competitors:", error);
    
    // Vercelのタイムアウトエラーを検出
    if (error.message?.includes("timeout") || error.message?.includes("Task timed out")) {
      return NextResponse.json(
        { 
          error: "処理がタイムアウトしました。分析に時間がかかりすぎています。",
          hint: "maxKeywordsやmaxCompetitorsPerKeywordを減らすか、しばらく時間をおいて再度お試しください。"
        },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to analyze competitors" },
      { status: 500 }
    );
  }
}

