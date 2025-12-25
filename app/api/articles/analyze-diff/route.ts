import { NextRequest, NextResponse } from "next/server";
import { ArticleScraper } from "@/lib/article-scraper";
import { DiffAnalyzer } from "@/lib/diff-analyzer";

/**
 * 自社記事と競合記事の差分を分析
 * POST /api/articles/analyze-diff
 * Body: { ownUrl: string, competitorUrls: string[], usePlaywright?: boolean }
 */
export async function POST(request: NextRequest) {
  let scraper: ArticleScraper | null = null;

  try {
    const body = await request.json();
    const { ownUrl, competitorUrls, usePlaywright = false } = body;

    if (!ownUrl || !competitorUrls || !Array.isArray(competitorUrls)) {
      return NextResponse.json(
        {
          error:
            "Missing required parameters: ownUrl, competitorUrls (array)",
        },
        { status: 400 }
      );
    }

    scraper = new ArticleScraper();

    // 自社記事を取得
    console.log(`[DiffAnalysis] Scraping own article: ${ownUrl}`);
    const ownArticle = await scraper.scrapeArticle(ownUrl, usePlaywright);

    // 競合記事を取得
    const competitorArticles = [];
    for (const url of competitorUrls) {
      try {
        console.log(`[DiffAnalysis] Scraping competitor article: ${url}`);
        const content = await scraper.scrapeArticle(url, usePlaywright);
        competitorArticles.push(content);
      } catch (error: any) {
        console.error(`[DiffAnalysis] Failed to scrape ${url}:`, error);
        // エラーが発生しても続行
      }
    }

    if (competitorArticles.length === 0) {
      return NextResponse.json(
        { error: "Failed to scrape any competitor articles" },
        { status: 500 }
      );
    }

    // 差分分析
    const analyzer = new DiffAnalyzer();
    const result = analyzer.analyze(ownArticle, competitorArticles);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error analyzing diff:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze diff" },
      { status: 500 }
    );
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
}

