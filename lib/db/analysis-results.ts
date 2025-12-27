import { createSupabaseClient } from "@/lib/supabase";
import { CompetitorAnalysisSummary } from "../competitor-analysis";

export interface AnalysisRun {
  id: string;
  article_id: string;
  trigger_type: "manual" | "scheduled" | "rank_drop";
  status: "pending" | "running" | "completed" | "failed";
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface AnalysisResult {
  id: string;
  analysis_run_id: string;
  article_id: string;
  average_position: number | null;
  previous_average_position: number | null;
  position_change: number | null;
  analyzed_keywords: string[];
  dropped_keywords: any; // JSONB
  top_keywords: any; // JSONB
  recommended_additions: any; // JSONB
  missing_content_summary: string | null;
  detailed_result_storage_key: string | null;
  detailed_result_expires_at: string | null;
  competitor_count: number | null;
  analysis_duration_seconds: number | null;
  created_at: string;
}

/**
 * 分析結果をDBに保存
 */
export async function saveAnalysisResult(
  userId: string,
  articleId: string,
  articleUrl: string,
  analysisResult: CompetitorAnalysisSummary,
  triggerType: "manual" | "scheduled" | "rank_drop" = "manual",
  analysisDurationSeconds?: number
): Promise<{ run: AnalysisRun; result: AnalysisResult }> {
  const supabase = createSupabaseClient();

  // 1. analysis_runs テーブルに実行履歴を記録
  const { data: run, error: runError } = await supabase
    .from("analysis_runs")
    .insert({
      article_id: articleId,
      trigger_type: triggerType,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) {
    throw new Error(`Failed to create analysis run: ${runError.message}`);
  }

  try {
    // 2. 分析結果のサマリーを準備
    const averagePosition =
      analysisResult.prioritizedKeywords.length > 0
        ? analysisResult.prioritizedKeywords.reduce(
            (sum, kw) => sum + kw.position,
            0
          ) / analysisResult.prioritizedKeywords.length
        : null;

    // 前回の分析結果を取得（比較用）
    const previousResult = await getLatestAnalysisResult(articleId);
    const previousAveragePosition = previousResult?.average_position || null;
    const positionChange =
      averagePosition && previousAveragePosition
        ? averagePosition - previousAveragePosition
        : null;

    // 分析対象キーワード
    const analyzedKeywords = analysisResult.prioritizedKeywords.map(
      (kw) => kw.keyword
    );

    // 下落したキーワード（10位以下）
    const droppedKeywords = analysisResult.prioritizedKeywords
      .filter((kw) => kw.position >= 10)
      .slice(0, 5)
      .map((kw) => ({
        keyword: kw.keyword,
        position: kw.position,
        previousPosition: null, // 前回の順位は後で追加可能
        impressions: kw.impressions,
        clicks: kw.clicks,
      }));

    // 上位キーワード（1-5位）
    const topKeywords = (analysisResult.topRankingKeywords || [])
      .slice(0, 5)
      .map((kw) => ({
        keyword: kw.keyword,
        position: kw.position,
        impressions: kw.impressions,
        clicks: kw.clicks,
      }));

    // 推奨追加項目
    const recommendedAdditions =
      analysisResult.semanticDiffAnalysis?.semanticAnalysis?.recommendedAdditions?.slice(
        0,
        10
      ) || [];

    // 不足内容の要約
    const missingContentSummary =
      analysisResult.semanticDiffAnalysis?.semanticAnalysis?.missingContent
        ?.slice(0, 5)
        .join(", ") || null;

    // 競合サイト数
    const competitorCount = analysisResult.uniqueCompetitorUrls.length;

    // 3. analysis_results テーブルに分析結果サマリーを保存
    const { data: result, error: resultError } = await supabase
      .from("analysis_results")
      .insert({
        analysis_run_id: run.id,
        article_id: articleId,
        average_position: averagePosition,
        previous_average_position: previousAveragePosition,
        position_change: positionChange,
        analyzed_keywords: analyzedKeywords,
        dropped_keywords: droppedKeywords.length > 0 ? droppedKeywords : null,
        top_keywords: topKeywords.length > 0 ? topKeywords : null,
        recommended_additions:
          recommendedAdditions.length > 0 ? recommendedAdditions : null,
        missing_content_summary: missingContentSummary,
        competitor_count: competitorCount,
        analysis_duration_seconds: analysisDurationSeconds || null,
      })
      .select()
      .single();

    if (resultError) {
      throw new Error(`Failed to save analysis result: ${resultError.message}`);
    }

    // 4. analysis_runs のステータスを 'completed' に更新
    await supabase
      .from("analysis_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return { run, result };
  } catch (error: any) {
    // エラーが発生した場合、analysis_runs のステータスを 'failed' に更新
    await supabase
      .from("analysis_runs")
      .update({
        status: "failed",
        error_message: error.message || "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    throw error;
  }
}

/**
 * 記事IDに紐づく分析結果一覧を取得
 */
export async function getAnalysisResultsByArticleId(
  articleId: string,
  limit: number = 10
): Promise<AnalysisResult[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("analysis_results")
    .select("*")
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Failed to get analysis results: ${error.message}`
    );
  }

  return data || [];
}

/**
 * 記事IDに紐づく最新の分析結果を取得
 */
export async function getLatestAnalysisResult(
  articleId: string
): Promise<AnalysisResult | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("analysis_results")
    .select("*")
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // レコードが見つからない場合
      return null;
    }
    throw new Error(
      `Failed to get latest analysis result: ${error.message}`
    );
  }

  return data;
}

/**
 * 分析実行履歴を取得
 */
export async function getAnalysisRunsByArticleId(
  articleId: string,
  limit: number = 10
): Promise<AnalysisRun[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("analysis_runs")
    .select("*")
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get analysis runs: ${error.message}`);
  }

  return data || [];
}

