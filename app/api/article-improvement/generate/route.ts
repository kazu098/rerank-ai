import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getArticleById } from "@/lib/db/articles";
import { getDetailedAnalysisData } from "@/lib/db/analysis-results";
import { ArticleImprovementGenerator } from "@/lib/article-improvement";
import { ArticleScraper } from "@/lib/article-scraper";
import { AISEOAnalyzer } from "@/lib/ai-seo-analyzer";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事改善案を生成
 * POST /api/article-improvement/generate
 */
export async function POST(request: NextRequest) {
  try {
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    // Gemini API keyが設定されているか確認
    if (!ArticleImprovementGenerator.isAvailable()) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.articleImprovementUnavailable") },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { analysisResultId } = body;

    if (!analysisResultId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.analysisResultIdRequired") },
        { status: 400 }
      );
    }

    // 分析結果を取得
    const supabase = createSupabaseClient();
    const { data: analysisResult, error: analysisError } = await supabase
      .from("analysis_results")
      .select("*, articles!inner(id, url, title)")
      .eq("id", analysisResultId)
      .single();

    if (analysisError || !analysisResult) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.analysisResultFetchFailed") },
        { status: 404 }
      );
    }

    // ユーザーが所有しているか確認
    const article = await getArticleById(analysisResult.article_id);
    if (!article || article.user_id !== session.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.accessDenied") },
        { status: 403 }
      );
    }

    // 詳細データを取得
    if (!analysisResult.detailed_result_storage_key) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.analysisResultFetchFailed") },
        { status: 404 }
      );
    }

    const detailedData = await getDetailedAnalysisData(
      analysisResultId,
      analysisResult.detailed_result_storage_key
    );

    if (!detailedData?.semanticDiffAnalysis?.semanticAnalysis?.recommendedAdditions) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.recommendedAdditionsNotFound") },
        { status: 404 }
      );
    }

    const semanticAnalysis = detailedData.semanticDiffAnalysis.semanticAnalysis;
    const recommendedAdditions = semanticAnalysis.recommendedAdditions;
    const whyCompetitorsRankHigher = semanticAnalysis.whyCompetitorsRankHigher || "";

    if (!recommendedAdditions || recommendedAdditions.length === 0) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.recommendedAdditionsNotFound") },
        { status: 404 }
      );
    }

    // 既存記事の全文を取得（fetchのみ、Playwrightは使用しない）
    const scraper = new ArticleScraper();
    try {
      const ownArticleContent = await scraper.scrapeArticle(article.url, false);

      // AI検索最適化（AIO対応）のチェック
      const aiSEOAnalyzer = new AISEOAnalyzer();
      const aiSEOCheckResult = aiSEOAnalyzer.checkAISEO(ownArticleContent);
      
      // 不足しているAIO対応要素を特定
      const missingAIOElements: string[] = [];
      if (!aiSEOCheckResult.hasFAQ) {
        missingAIOElements.push("FAQセクション（よくある質問）");
      }
      if (!aiSEOCheckResult.hasSummary) {
        missingAIOElements.push("要約セクション（主なポイント、まとめ）");
      }
      if (!aiSEOCheckResult.hasUpdateDate) {
        missingAIOElements.push("更新日の表示");
      }
      if (!aiSEOCheckResult.hasAuthorInfo) {
        missingAIOElements.push("著者情報の明記");
      }
      if (!aiSEOCheckResult.hasDataOrStats) {
        missingAIOElements.push("データ・統計の提示");
      }
      if (!aiSEOCheckResult.hasStructuredData) {
        missingAIOElements.push("構造化データ（JSON-LD）");
      }
      if (!aiSEOCheckResult.hasQuestionHeadings) {
        missingAIOElements.push("質問形式の見出し（例：〇〇とは？）");
      }
      if (!aiSEOCheckResult.hasBulletPoints) {
        missingAIOElements.push("箇条書きの活用");
      }
      if (!aiSEOCheckResult.hasTables) {
        missingAIOElements.push("表の活用");
      }

      // 記事改善案を生成
      const generator = new ArticleImprovementGenerator();
      const improvement = await generator.generateImprovement(
        article.url,
        ownArticleContent,
        whyCompetitorsRankHigher,
        recommendedAdditions,
        missingAIOElements
      );

      return NextResponse.json({
        improvement,
      });
    } catch (scrapeError: any) {
      console.error("[Article Improvement] Error scraping article:", scrapeError);
      return NextResponse.json(
        {
          error: getErrorMessage(locale, "errors.articleScrapeFailed"),
          details: scrapeError.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[Article Improvement API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.articleImprovementGenerationFailed") },
      { status: 500 }
    );
  }
}
