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
    } = body;

    if (!siteUrl || !pageUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl" },
        { status: 400 }
      );
    }

    console.log(
      `[API] Starting competitor analysis for ${siteUrl}${pageUrl}, maxKeywords: ${maxKeywords}, maxCompetitorsPerKeyword: ${maxCompetitorsPerKeyword}`
    );

    const analyzer = new CompetitorAnalyzer();
    const result = await analyzer.analyzeCompetitors(
      siteUrl,
      pageUrl,
      maxKeywords,
      maxCompetitorsPerKeyword
    );

    console.log(
      `[API] Analysis complete: ${result.competitorResults.length} keyword results, ${result.uniqueCompetitorUrls.length} unique competitor URLs`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error analyzing competitors:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze competitors" },
      { status: 500 }
    );
  }
}

