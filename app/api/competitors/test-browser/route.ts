import { NextRequest, NextResponse } from "next/server";
import { CompetitorExtractor } from "@/lib/competitor-extractor";

/**
 * ブラウジングツール（Playwright）の動作確認用エンドポイント
 * GET /api/competitors/test-browser?keyword=ポケとも 価格
 */
export async function GET(request: NextRequest) {
  let extractor: CompetitorExtractor | null = null;

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get("keyword");

    if (!keyword) {
      return NextResponse.json(
        { error: "Missing required parameter: keyword" },
        { status: 400 }
      );
    }

    console.log(`[TestBrowser] Testing browser tool with keyword: "${keyword}"`);

    extractor = new CompetitorExtractor();
    
    // ダミーのownUrlを設定（順位特定のため）
    const dummyUrl = "https://example.com";
    
    // ブラウジングツールで検索実行
    const result = await extractor.extractCompetitors(
      keyword,
      dummyUrl,
      10, // maxCompetitors
      3   // retryCount（テスト用に短縮）
    );

    return NextResponse.json({
      success: true,
      keyword,
      resultsCount: result.totalResults,
      competitorsCount: result.competitors.length,
      competitors: result.competitors.slice(0, 5), // 最初の5件だけ返す（テスト用）
      ownPosition: result.ownPosition,
      message: "Browser tool is working correctly!",
    });
  } catch (error: any) {
    console.error("Error testing browser tool:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to test browser tool",
        isCaptchaError: error.message?.includes("CAPTCHA") || false,
      },
      { status: 500 }
    );
  } finally {
    if (extractor) {
      await extractor.close();
    }
  }
}


