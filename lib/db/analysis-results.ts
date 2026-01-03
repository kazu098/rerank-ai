import { createSupabaseClient } from "@/lib/supabase";
import { CompetitorAnalysisSummary } from "../competitor-analysis";
import { put } from "@vercel/blob";

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
  competitor_urls: string[] | null; // 競合URL一覧（JSONB）
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

    // 競合URL一覧（通知メールに必要）
    const competitorUrls = analysisResult.uniqueCompetitorUrls.length > 0
      ? analysisResult.uniqueCompetitorUrls
      : null;

    // 3. analysis_results テーブルに分析結果サマリーを保存（まず作成）
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
        competitor_urls: competitorUrls, // 競合URL一覧を保存
        analysis_duration_seconds: analysisDurationSeconds || null,
        detailed_result_storage_key: null, // 一時的にnull、後で更新
        detailed_result_expires_at: null, // 一時的にnull、後で更新
      })
      .select()
      .single();

    if (resultError) {
      throw new Error(`Failed to save analysis result: ${resultError.message}`);
    }

    // 4. 詳細データをVercel Blob Storageに保存（LLM分析の詳細のみ）
    let storageKey: string | null = null;
    let expiresAt: string | null = null;

    if (analysisResult.semanticDiffAnalysis || analysisResult.aiSEOAnalysis || analysisResult.keywordTimeSeries) {
      try {
        // 30日間の有効期限を設定
        const expiresInSeconds = 30 * 24 * 60 * 60; // 30日
        const expiresAtDate = new Date(Date.now() + expiresInSeconds * 1000);

        // 保存する詳細データ（LLM分析の詳細、AI SEO分析、キーワード時系列データ）
        const detailedData = {
          semanticDiffAnalysis: analysisResult.semanticDiffAnalysis,
          aiSEOAnalysis: analysisResult.aiSEOAnalysis,
          keywordTimeSeries: analysisResult.keywordTimeSeries,
        };

        // Vercel Blob Storageに保存
        const blob = await put(
          `analysis/${result.id}/detailed.json`,
          JSON.stringify(detailedData),
          {
            access: "public",
            addRandomSuffix: false,
          }
        );

        storageKey = blob.url;
        expiresAt = expiresAtDate.toISOString();
        console.log(
          `[Analysis Results] Detailed data saved to blob storage: ${storageKey}`
        );

        // ストレージキーと有効期限を更新
        const { error: updateError } = await supabase
          .from("analysis_results")
          .update({
            detailed_result_storage_key: storageKey,
            detailed_result_expires_at: expiresAt,
          })
          .eq("id", result.id);

        if (updateError) {
          console.error(
            "[Analysis Results] Failed to update storage key:",
            updateError
          );
          // 更新に失敗しても処理は続行
        }
      } catch (blobError: any) {
        console.error(
          "[Analysis Results] Failed to save detailed data to blob storage:",
          blobError
        );
        // 詳細データの保存に失敗しても、サマリーは保存する
        // エラーをログに記録するが、処理は続行
      }
    }

    // 5. analysis_runs のステータスを 'completed' に更新
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
 * 記事IDに紐づく前回（2番目に新しい）の分析結果を取得
 */
export async function getPreviousAnalysisResult(
  articleId: string
): Promise<AnalysisResult | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("analysis_results")
    .select("*")
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(2);

  if (error) {
    throw new Error(
      `Failed to get previous analysis result: ${error.message}`
    );
  }

  // 2番目に新しい結果を返す（最新が1件目、前回が2件目）
  if (data && data.length >= 2) {
    return data[1];
  }

  return null;
}

/**
 * 複数の記事IDに紐づく最新の分析結果を一括取得（N+1クエリを回避）
 * 返り値: Map<articleId, AnalysisResult | null>
 * 
 * 実装: RPC（PostgreSQL関数）を使用して、各article_idごとに最新の1件を取得
 * または、全件取得してJavaScriptでフィルタリング（記事数が少ない場合は有効）
 */
export async function getLatestAnalysesByArticleIds(
  articleIds: string[]
): Promise<Map<string, AnalysisResult | null>> {
  if (articleIds.length === 0) {
    return new Map();
  }

  const supabase = createSupabaseClient();

  // 全記事IDの分析結果を取得（article_id IN (ids)）
  // その後、JavaScriptで各article_idごとに最新の1件をフィルタリング
  // 記事数が少ない場合は、この方法で十分効率的
  const { data: allResults, error } = await supabase
    .from("analysis_results")
    .select("*")
    .in("article_id", articleIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Analysis Results] Failed to get latest analyses:", error);
    // エラーが発生した場合、空のMapを返す
    return new Map();
  }

  // 各article_idごとに最新の1件のみを抽出
  const resultMap = new Map<string, AnalysisResult | null>();
  const seenArticleIds = new Set<string>();

  if (allResults) {
    for (const result of allResults) {
      if (!seenArticleIds.has(result.article_id)) {
        resultMap.set(result.article_id, result as AnalysisResult);
        seenArticleIds.add(result.article_id);
      }
    }
  }

  // 分析結果がない記事IDに対してnullを設定
  articleIds.forEach((articleId) => {
    if (!resultMap.has(articleId)) {
      resultMap.set(articleId, null);
    }
  });

  return resultMap;
}

/**
 * 複数の記事IDに紐づく前回の分析結果を一括取得（N+1クエリを回避）
 * 返り値: Map<articleId, AnalysisResult | null>
 * 
 * 実装: 全件取得してJavaScriptでフィルタリング（各article_idごとに2番目に新しい結果を取得）
 */
export async function getPreviousAnalysesByArticleIds(
  articleIds: string[]
): Promise<Map<string, AnalysisResult | null>> {
  if (articleIds.length === 0) {
    return new Map();
  }

  const supabase = createSupabaseClient();

  // 全記事IDの分析結果を取得（各article_idごとに最大2件必要）
  // 記事IDごとにグループ化して、2番目に新しい結果を取得
  const { data: allResults, error } = await supabase
    .from("analysis_results")
    .select("*")
    .in("article_id", articleIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Analysis Results] Failed to get previous analyses:", error);
    // エラーが発生した場合、空のMapを返す
    return new Map();
  }

  // 各article_idごとに最新2件をグループ化
  const articleResultsMap = new Map<string, AnalysisResult[]>();
  if (allResults) {
    for (const result of allResults) {
      const articleId = result.article_id;
      if (!articleResultsMap.has(articleId)) {
        articleResultsMap.set(articleId, []);
      }
      const results = articleResultsMap.get(articleId)!;
      if (results.length < 2) {
        results.push(result as AnalysisResult);
      }
    }
  }

  // 各article_idごとに2番目に新しい結果を取得
  const resultMap = new Map<string, AnalysisResult | null>();
  articleIds.forEach((articleId) => {
    const results = articleResultsMap.get(articleId);
    // 2番目に新しい結果を返す（最新が1件目、前回が2件目）
    const previousResult = results && results.length >= 2 ? results[1] : null;
    resultMap.set(articleId, previousResult);
  });

  return resultMap;
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

/**
 * 詳細データを取得（Vercel Blob Storageから）
 */
export async function getDetailedAnalysisData(
  analysisResultId: string,
  storageKey: string
): Promise<{
  semanticDiffAnalysis?: CompetitorAnalysisSummary["semanticDiffAnalysis"];
  aiSEOAnalysis?: CompetitorAnalysisSummary["aiSEOAnalysis"];
  keywordTimeSeries?: CompetitorAnalysisSummary["keywordTimeSeries"];
} | null> {
  try {
    // 有効期限をチェック
    const supabase = createSupabaseClient();
    const { data: result, error } = await supabase
      .from("analysis_results")
      .select("detailed_result_expires_at")
      .eq("id", analysisResultId)
      .single();

    if (error) {
      throw new Error(
        `Failed to get analysis result: ${error.message}`
      );
    }

    if (!result?.detailed_result_expires_at) {
      console.warn(
        `[Analysis Results] No expiration date found for analysis result ${analysisResultId}`
      );
      return null;
    }

    const expiresAt = new Date(result.detailed_result_expires_at);
    if (expiresAt < new Date()) {
      console.warn(
        `[Analysis Results] Detailed data has expired for analysis result ${analysisResultId}`
      );
      return null;
    }

    // Vercel Blob Storageから取得（URLから直接fetch）
    const response = await fetch(storageKey);

    if (!response.ok) {
      console.warn(
        `[Analysis Results] Failed to fetch blob: ${response.status} ${response.statusText}`
      );
      return null;
    }

    // JSONとしてパース
    const detailedData = await response.json();

    return detailedData;
  } catch (error: any) {
    console.error(
      `[Analysis Results] Failed to get detailed data: ${error.message}`
    );
    return null;
  }
}

