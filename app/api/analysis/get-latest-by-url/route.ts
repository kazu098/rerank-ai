import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticleByUrl } from "@/lib/db/articles";
import { getLatestAnalysisResult } from "@/lib/db/analysis-results";
import { getDetailedAnalysisData } from "@/lib/db/analysis-results";

/**
 * 記事URLから最新の分析結果を取得（詳細データ含む）
 * POST /api/analysis/get-latest-by-url
 * Body: { url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "urlパラメータが必要です" },
        { status: 400 }
      );
    }

    // 記事を取得
    const article = await getArticleByUrl(session.userId, url);

    if (!article) {
      return NextResponse.json({
        hasAnalysis: false,
      });
    }

    // 最新の分析結果を取得
    const latestAnalysis = await getLatestAnalysisResult(article.id);

    if (!latestAnalysis) {
      return NextResponse.json({
        hasAnalysis: false,
      });
    }

    // 詳細データを取得
    let detailedData: {
      semanticDiffAnalysis?: any;
      aiSEOAnalysis?: any;
    } | null = null;
    if (latestAnalysis.detailed_result_storage_key) {
      detailedData = await getDetailedAnalysisData(
        latestAnalysis.id,
        latestAnalysis.detailed_result_storage_key
      );
    }

    // 分析結果をフォーマット（ホームページで表示する形式に合わせる）
    // analysis_resultsテーブルから取得したデータをCompetitorAnalysisSummary形式に変換
    
    // 優先キーワード（top_keywordsとdropped_keywordsを結合）
    const prioritizedKeywords = [
      ...(latestAnalysis.top_keywords || []),
      ...(latestAnalysis.dropped_keywords || []),
    ].map((kw: any) => ({
      keyword: kw.keyword,
      priority: kw.position <= 5 ? 1 : kw.position <= 10 ? 2 : 3,
      impressions: kw.impressions || 0,
      clicks: kw.clicks || 0,
      position: kw.position,
    }));

    const analysisResult = {
      prioritizedKeywords,
      competitorResults: [], // 競合結果は詳細データから取得できないため空配列
      uniqueCompetitorUrls: latestAnalysis.competitor_urls || [],
      keywordTimeSeries: [], // 時系列データは詳細データから取得できないため空配列
      semanticDiffAnalysis: detailedData?.semanticDiffAnalysis || null,
      aiSEOAnalysis: detailedData?.aiSEOAnalysis || null,
      topRankingKeywords: latestAnalysis.top_keywords || [],
    };

    return NextResponse.json({
      hasAnalysis: true,
      articleId: article.id,
      analysisResult,
      analyzedAt: latestAnalysis.created_at,
    });
  } catch (error: any) {
    console.error("Error getting latest analysis by URL:", error);
    return NextResponse.json(
      { error: error.message || "分析結果の取得に失敗しました" },
      { status: 500 }
    );
  }
}

