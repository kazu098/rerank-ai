import { NextRequest, NextResponse } from "next/server";
import { ArticleScraper } from "@/lib/article-scraper";

/**
 * 記事をスクレイピング
 * POST /api/articles/scrape
 * Body: { url: string, usePlaywright?: boolean }
 */
export async function POST(request: NextRequest) {
  let scraper: ArticleScraper | null = null;

  try {
    const body = await request.json();
    const { url, usePlaywright = false } = body;

    if (!url) {
      return NextResponse.json(
        { error: "Missing required parameter: url" },
        { status: 400 }
      );
    }

    scraper = new ArticleScraper();
    const content = await scraper.scrapeArticle(url, usePlaywright);

    return NextResponse.json(content);
  } catch (error: any) {
    console.error("Error scraping article:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scrape article" },
      { status: 500 }
    );
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
}

