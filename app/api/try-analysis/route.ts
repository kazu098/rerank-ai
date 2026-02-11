import { NextRequest, NextResponse } from "next/server";
import { SerperApiClient } from "@/lib/serper-api";
import { checkRateLimit, getClientIpAddress } from "@/lib/rate-limit";
import { ArticleScraper } from "@/lib/article-scraper";
import { DiffAnalyzer } from "@/lib/diff-analyzer";

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

const MAX_KEYWORDS = 5;

/**
 * 未ログイン体験: 記事URL + キーワードで順位を取得（GSC不要・Serper使用）
 * POST /api/try-analysis
 * Body: { articleUrl: string, keyword: string }
 *   keyword: 1件、またはカンマ区切りで最大5件
 * レート制限: 同一IPで1時間に5回まで
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIpAddress(request) ?? "unknown";
    const { allowed, remaining, resetAt } = await checkRateLimit(ip, "try_analysis");
    if (!allowed) {
      return NextResponse.json(
        {
          error: "rate_limit",
          message: "Too many attempts. Please try again later.",
          resetAt: resetAt.toISOString(),
        },
        { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
      );
    }

    const body = await request.json();
    const articleUrl = typeof body?.articleUrl === "string" ? body.articleUrl.trim() : "";
    const keywordInput = typeof body?.keyword === "string" ? body.keyword.trim() : "";

    const keywords = keywordInput
      .split(",")
      .map((k: string) => k.trim())
      .filter(Boolean)
      .slice(0, MAX_KEYWORDS);

    if (!articleUrl || keywords.length === 0) {
      return NextResponse.json(
        { error: "Missing articleUrl or keyword" },
        { status: 400 }
      );
    }

    if (keywordInput.length > 500) {
      return NextResponse.json(
        { error: "Keyword too long" },
        { status: 400 }
      );
    }

    try {
      new URL(articleUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid article URL" },
        { status: 400 }
      );
    }

    if (!SerperApiClient.isAvailable()) {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      );
    }

    const normalizedInput = normalizeUrl(articleUrl);
    const client = new SerperApiClient();
    const results: Array<{ keyword: string; position: number | null; positionLabel: string }> = [];
    let firstKeywordSearchResults: Array<{ url: string; title: string; position: number }> | null = null;

    for (const keyword of keywords) {
      const searchResults = await client.search(keyword, "Japan", 20);
      if (keywords.indexOf(keyword) === 0) {
        firstKeywordSearchResults = searchResults;
      }
      const found = searchResults.find((r) => normalizeUrl(r.url) === normalizedInput);
      const position = found?.position ?? null;
      const positionLabel = position !== null ? `${position}位` : "20位以下";
      results.push({ keyword, position, positionLabel });
    }

    let hint: string | null = null;
    if (firstKeywordSearchResults && firstKeywordSearchResults.length > 0) {
      const firstCompetitor = firstKeywordSearchResults.find(
        (r) => normalizeUrl(r.url) !== normalizedInput
      );
      if (firstCompetitor) {
        try {
          const scraper = new ArticleScraper();
          const [ownArticle, competitorArticle] = await Promise.allSettled([
            scraper.scrapeArticle(articleUrl, false),
            scraper.scrapeArticle(firstCompetitor.url, false),
          ]);
          if (
            ownArticle.status === "fulfilled" &&
            competitorArticle.status === "fulfilled" &&
            competitorArticle.value
          ) {
            const diffAnalyzer = new DiffAnalyzer();
            const diff = diffAnalyzer.analyze(ownArticle.value, [competitorArticle.value]);
            if (diff.recommendations.length > 0) {
              hint = diff.recommendations[0];
            }
          }
        } catch (e) {
          console.warn("[try-analysis] Hint generation failed:", e);
        }
      }
    }

    return NextResponse.json(
      {
        results,
        hint,
        ctaMessage: "full_analysis_after_signup",
      },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err: unknown) {
    console.error("[try-analysis]", err);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
