import { NextRequest, NextResponse } from "next/server";
import { LLMDiffAnalyzer } from "@/lib/llm-diff-analyzer";
import { ArticleScraper } from "@/lib/article-scraper";

/**
 * Qwen APIのテスト用エンドポイント
 * GET /api/llm/test-qwen?keyword=検索キーワード&ownUrl=自社URL&competitorUrl=競合URL
 */
export async function GET(request: NextRequest) {
  let scraper: ArticleScraper | null = null;

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get("keyword") || "ポケとも 価格";
    const ownUrl = searchParams.get("ownUrl") || "https://mia-cat.com/blog/poketomo-review/";
    const competitorUrl = searchParams.get("competitorUrl") || "https://example.com";

    // 環境変数の確認
    const llmProvider = process.env.LLM_PROVIDER || "groq";
    const qwenApiKey = process.env.QWEN_API_KEY;

    if (!qwenApiKey) {
      return NextResponse.json(
        {
          error: "QWEN_API_KEY is not set in environment variables",
          hint: "Please set QWEN_API_KEY in .env.local",
        },
        { status: 400 }
      );
    }

    if (llmProvider.toLowerCase() !== "qwen") {
      return NextResponse.json(
        {
          warning: `LLM_PROVIDER is set to "${llmProvider}", but testing Qwen API. Please set LLM_PROVIDER=qwen`,
          hint: "Setting LLM_PROVIDER=qwen for this test",
        },
        { status: 200 }
      );
    }

    console.log(`[TestQwen] Starting test with keyword: "${keyword}"`);
    console.log(`[TestQwen] Own URL: ${ownUrl}`);
    console.log(`[TestQwen] Competitor URL: ${competitorUrl}`);

    // 記事をスクレイピング
    scraper = new ArticleScraper();

    console.log(`[TestQwen] Scraping own article...`);
    const ownArticle = await scraper.scrapeArticle(ownUrl, false);

    console.log(`[TestQwen] Scraping competitor article...`);
    const competitorArticle = await scraper.scrapeArticle(competitorUrl, false);

    // LLM差分分析を実行
    console.log(`[TestQwen] Running LLM diff analysis with Qwen API...`);
    const llmAnalyzer = new LLMDiffAnalyzer();
    const result = await llmAnalyzer.analyzeSemanticDiff(
      keyword,
      ownArticle,
      [competitorArticle]
    );

    console.log(`[TestQwen] Analysis complete`);

    return NextResponse.json({
      success: true,
      message: "Qwen API test successful",
      keyword,
      ownUrl,
      competitorUrl,
      result,
    });
  } catch (error: any) {
    console.error("[TestQwen] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to test Qwen API",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
}

