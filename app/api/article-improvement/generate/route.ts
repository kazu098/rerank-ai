import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupabaseClient } from "@/lib/supabase";
import { getArticleById } from "@/lib/db/articles";
import { getDetailedAnalysisData } from "@/lib/db/analysis-results";
import { ArticleImprovementGenerator } from "@/lib/article-improvement";
import { ArticleScraper } from "@/lib/article-scraper";
import { AISEOAnalyzer } from "@/lib/ai-seo-analyzer";

/**
 * 記事改善案を生成
 * POST /api/article-improvement/generate
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    // Gemini API keyが設定されているか確認
    if (!ArticleImprovementGenerator.isAvailable()) {
      return NextResponse.json(
        { error: "記事改善機能は現在利用できません。GEMINI_API_KEYが設定されていません。" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { analysisResultId } = body;

    if (!analysisResultId) {
      return NextResponse.json(
        { error: "analysisResultIdが必要です。" },
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
        { error: "分析結果が見つかりません。" },
        { status: 404 }
      );
    }

    // ユーザーが所有しているか確認
    const article = await getArticleById(analysisResult.article_id);
    if (!article || article.user_id !== session.userId) {
      return NextResponse.json(
        { error: "アクセス権限がありません。" },
        { status: 403 }
      );
    }

    // 詳細データを取得
    if (!analysisResult.detailed_result_storage_key) {
      return NextResponse.json(
        { error: "詳細データが見つかりません。" },
        { status: 404 }
      );
    }

    const detailedData = await getDetailedAnalysisData(
      analysisResultId,
      analysisResult.detailed_result_storage_key
    );

    if (!detailedData?.semanticDiffAnalysis?.semanticAnalysis?.recommendedAdditions) {
      return NextResponse.json(
        { error: "追加すべき項目が見つかりません。" },
        { status: 404 }
      );
    }

    const semanticAnalysis = detailedData.semanticDiffAnalysis.semanticAnalysis;
    const recommendedAdditions = semanticAnalysis.recommendedAdditions;
    const whyCompetitorsRankHigher = semanticAnalysis.whyCompetitorsRankHigher || "";

    if (!recommendedAdditions || recommendedAdditions.length === 0) {
      return NextResponse.json(
        { error: "追加すべき項目が見つかりません。" },
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
          error: "記事の取得に失敗しました。記事が公開されているか、URLが正しいか確認してください。",
          details: scrapeError.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[Article Improvement API] Error:", error);
    return NextResponse.json(
      { error: error.message || "記事改善案の生成に失敗しました。" },
      { status: 500 }
    );
  }
}
