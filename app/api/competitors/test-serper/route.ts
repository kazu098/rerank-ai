import { NextRequest, NextResponse } from "next/server";
import { SerperApiClient } from "@/lib/serper-api";

/**
 * Serper APIの動作確認用エンドポイント
 * GET /api/competitors/test-serper?keyword=ポケとも 価格
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get("keyword");

    if (!keyword) {
      return NextResponse.json(
        { error: "Missing required parameter: keyword" },
        { status: 400 }
      );
    }

    // Serper APIが利用可能か確認
    if (!SerperApiClient.isAvailable()) {
      return NextResponse.json(
        { error: "SERPER_API_KEY is not set" },
        { status: 400 }
      );
    }

    console.log(`[TestSerper] Testing Serper API with keyword: "${keyword}"`);

    const client = new SerperApiClient();
    const results = await client.search(keyword, "Japan", 10);

    return NextResponse.json({
      success: true,
      keyword,
      resultsCount: results.length,
      results: results.slice(0, 5), // 最初の5件だけ返す（テスト用）
      message: "Serper API is working correctly!",
    });
  } catch (error: any) {
    console.error("Error testing Serper API:", error);
    return NextResponse.json(
      { error: error.message || "Failed to test Serper API" },
      { status: 500 }
    );
  }
}


