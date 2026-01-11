import { NextRequest, NextResponse } from "next/server";
import { CompetitorExtractor } from "@/lib/competitor-extractor";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 競合URLを抽出
 * POST /api/competitors/extract
 * Body: { keyword: string, ownUrl: string, maxCompetitors?: number }
 */
export async function POST(request: NextRequest) {
  let extractor: CompetitorExtractor | null = null;

  try {
    const body = await request.json();
    const { keyword, ownUrl, maxCompetitors = 3 } = body;

    if (!keyword || !ownUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: keyword, ownUrl" },
        { status: 400 }
      );
    }

    extractor = new CompetitorExtractor();
    // 本番環境ではSerper.devを優先（速度重視）
    const preferSerperApi = process.env.PREFER_SERPER_API === "true" || process.env.NODE_ENV === "production";
    
    // localeを取得
    const { locale } = await getSessionAndLocale(request);
    
    const result = await extractor.extractCompetitors(
      keyword,
      ownUrl,
      maxCompetitors,
      5, // retryCount
      preferSerperApi,
      false, // isManualScan
      locale
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error extracting competitors:", error);
    return NextResponse.json(
      { error: error.message || "Failed to extract competitors" },
      { status: 500 }
    );
  } finally {
    if (extractor) {
      await extractor.close();
    }
  }
}

