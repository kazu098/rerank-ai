"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getDetailedAnalysisData } from "@/lib/db/analysis-results";

interface ArticleDetail {
  article: {
    id: string;
    url: string;
    title: string | null;
    site_id: string | null;
    current_average_position: number | null;
    previous_average_position: number | null;
    last_analyzed_at: string | null;
    is_monitoring: boolean;
    is_fixed: boolean | null;
    fixed_at: string | null;
  };
  analysisResults: Array<{
    id: string;
    average_position: number | null;
    previous_average_position: number | null;
    position_change: number | null;
    analyzed_keywords: string[];
    competitor_count: number | null;
    created_at: string;
    detailed_result_storage_key: string | null;
  }>;
  analysisRuns: Array<{
    id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>;
}

export default function ArticleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailedData, setDetailedData] = useState<Record<string, any>>({});
  const [loadingDetailed, setLoadingDetailed] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const articleId = params.id;

  const fetchArticleDetail = useCallback(async () => {
    if (!articleId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/articles/${articleId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "記事の取得に失敗しました");
      }

      const articleData = await response.json();
      setData(articleData);

      // すべての分析結果の詳細データを自動的に取得
      if (articleData.analysisResults) {
        articleData.analysisResults.forEach((result: any) => {
          if (result.detailed_result_storage_key) {
            fetchDetailedAnalysis(result.id, result.detailed_result_storage_key);
          }
        });
      }
    } catch (err: any) {
      console.error("[Article Detail] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/`);
      return;
    }

    if (status === "authenticated" && articleId) {
      fetchArticleDetail();
    }
  }, [status, articleId, router, locale, fetchArticleDetail]);

  // ?analyze=trueパラメータをチェックして自動分析を実行
  useEffect(() => {
    if (!data?.article || analyzing || loading) return;

    const shouldAnalyze = searchParams?.get("analyze") === "true";
    if (!shouldAnalyze) return;

    // 最後の分析から24時間以上経過しているかチェック
    if (data.article.last_analyzed_at) {
      const lastAnalyzed = new Date(data.article.last_analyzed_at);
      const now = new Date();
      const hoursSinceLastAnalysis = (now.getTime() - lastAnalyzed.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastAnalysis < 24) {
        // 24時間以内の場合はスキップしてURLからパラメータを削除
        const currentPath = pathname.split('?')[0]; // クエリパラメータを除去
        router.replace(currentPath);
        return;
      }
    }

    // 自動分析を実行
    handleStartAnalysis();
  }, [data, analyzing, loading, searchParams, router]);

  const handleStartAnalysis = useCallback(async () => {
    if (!data?.article || !data.article.site_id || analyzing) return;

    // 今日既に分析されているかチェック
    try {
      const checkResponse = await fetch("/api/articles/check-recent-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: data.article.url,
        }),
      });

      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        if (checkResult.analyzedToday) {
          // 今日既に分析されている場合は、分析結果を再取得して表示
          await fetchArticleDetail();
          return; // 新しい分析を実行せずに終了
        }
      }
    } catch (checkError: any) {
      console.error("[Article Detail] Error checking recent analysis:", checkError);
      // チェックエラーは無視して続行
    }

    setAnalyzing(true);
    setError(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setEstimatedTimeRemaining(60); // 初期推定時間: 60秒

    const analysisStartTime = Date.now();

    try {
      // サイト情報を取得
      const siteResponse = await fetch(`/api/sites/${data.article.site_id}`);
      if (!siteResponse.ok) {
        throw new Error("サイト情報の取得に失敗しました");
      }
      const site = await siteResponse.json();
      const siteUrl = site.site_url.replace(/\/$/, "");

      // 記事URLからpageUrlを抽出
      const urlObj = new URL(data.article.url);
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");

      // Step 1: 記事の検索順位データを取得中
      setCurrentStep(1);
      setEstimatedTimeRemaining(50);
      const step1Response = await fetch("/api/competitors/analyze-step1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteUrl,
          pageUrl,
          maxKeywords: 3,
        }),
      });

      if (!step1Response.ok) {
        const errorData = await step1Response.json();
        throw new Error(errorData.error || "Step 1に失敗しました");
      }

      const step1Result = await step1Response.json();
      setCompletedSteps(prev => new Set([1, 2, 3]));
      setCurrentStep(4);
      setEstimatedTimeRemaining(40);

      // Step 2: 競合URL抽出
      const step2Response = await fetch("/api/competitors/analyze-step2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteUrl,
          pageUrl,
          prioritizedKeywords: step1Result.prioritizedKeywords,
          maxCompetitorsPerKeyword: 3,
        }),
      });

      if (!step2Response.ok) {
        const errorData = await step2Response.json();
        throw new Error(errorData.error || "Step 2に失敗しました");
      }

      const step2Result = await step2Response.json();
      setCompletedSteps(prev => new Set([...prev, 4]));
      setCurrentStep(5);
      setEstimatedTimeRemaining(30);

      // Step 3: 記事スクレイピング + LLM分析
      let step3Result: any = null;
      if (step2Result.uniqueCompetitorUrls.length > 0) {
        setCompletedSteps(prev => new Set([...prev, 5]));
        setCurrentStep(6);
        setEstimatedTimeRemaining(20);

        const step3Response = await fetch("/api/competitors/analyze-step3", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            siteUrl,
            pageUrl,
            prioritizedKeywords: step1Result.prioritizedKeywords,
            competitorResults: step2Result.competitorResults,
            uniqueCompetitorUrls: step2Result.uniqueCompetitorUrls,
            skipLLMAnalysis: false,
          }),
        });

        if (!step3Response.ok) {
          const errorData = await step3Response.json();
          console.error("Step 3 failed:", errorData);
          setCompletedSteps(prev => new Set([...prev, 6, 7]));
          setCurrentStep(0);
        } else {
          step3Result = await step3Response.json();
          setCompletedSteps(prev => new Set([...prev, 6, 7]));
          setCurrentStep(0);
          setEstimatedTimeRemaining(null);
        }
      } else {
        setCompletedSteps(prev => new Set([...prev, 5, 6, 7]));
        setCurrentStep(0);
        setEstimatedTimeRemaining(null);
      }

      // 分析結果をDBに保存
      const analysisDurationSeconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      const saveResponse = await fetch("/api/analysis/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          articleUrl: data.article.url,
          siteUrl,
          analysisResult: {
            ...step1Result,
            ...step2Result,
            ...(step3Result || {}),
          },
          analysisDurationSeconds,
        }),
      });

      if (saveResponse.ok) {
        // データを再取得
        await fetchArticleDetail();
      }

      // URLからanalyzeパラメータを削除
      const currentPath = pathname.split('?')[0]; // クエリパラメータを除去
      router.replace(currentPath);
    } catch (err: any) {
      console.error("[Analysis] Error:", err);
      setError(err.message || "分析の実行に失敗しました");
      setCurrentStep(0);
      setCompletedSteps(new Set());
    } finally {
      setAnalyzing(false);
      setEstimatedTimeRemaining(null);
    }
  }, [data, analyzing, router, fetchArticleDetail]);

  const fetchDetailedAnalysis = async (analysisId: string, storageKey: string) => {
    if (detailedData[analysisId] || loadingDetailed.has(analysisId)) {
      return;
    }

    try {
      setLoadingDetailed((prev) => new Set(prev).add(analysisId));
      const response = await fetch(`/api/analysis/detailed?storageKey=${encodeURIComponent(storageKey)}`);

      if (!response.ok) {
        throw new Error("詳細データの取得に失敗しました");
      }

      const detailed = await response.json();
      setDetailedData((prev) => ({ ...prev, [analysisId]: detailed }));
    } catch (err: any) {
      console.error("[Article Detail] Error fetching detailed data:", err);
      setDetailedData((prev) => ({ ...prev, [analysisId]: { error: err.message } }));
    } finally {
      setLoadingDetailed((prev) => {
        const next = new Set(prev);
        next.delete(analysisId);
        return next;
      });
    }
  };

  const handleDeleteArticle = async () => {
    if (!articleId || !confirm("この記事を削除しますか？")) {
      return;
    }

    try {
      const response = await fetch(`/api/articles/${articleId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "記事の削除に失敗しました");
      }

      router.push(`/dashboard`);
    } catch (err: any) {
      alert(err.message || "記事の削除に失敗しました");
    }
  };

  const handleMarkAsFixed = async () => {
    if (!articleId) return;

    try {
      const response = await fetch(`/api/articles/${articleId}/mark-as-fixed`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "修正済みフラグの更新に失敗しました");
      }

      // データを再取得
      fetchArticleDetail();
    } catch (err: any) {
      alert(err.message || "修正済みフラグの更新に失敗しました");
    }
  };

  // 分析中の表示
  if (analyzing) {
    const steps = [
      t("analysis.step1"),
      t("analysis.step2"),
      t("analysis.step3"),
      t("analysis.step4"),
      t("analysis.step5"),
      t("analysis.step6"),
      t("analysis.step7"),
    ];

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">{t("analysis.progress")}</h2>
          
          {/* プログレスバー */}
          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(completedSteps.size / 7) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* ステップ表示 */}
          <div className="space-y-3 mb-6">
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCompleted = completedSteps.has(stepNumber);
              const isCurrent = currentStep === stepNumber;

              return (
                <div
                  key={stepNumber}
                  className={`flex items-center p-3 rounded ${
                    isCompleted
                      ? "bg-green-50 border border-green-200"
                      : isCurrent
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-gray-50 border border-gray-200"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isCurrent
                        ? "bg-blue-500 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {isCompleted ? "✓" : stepNumber}
                  </div>
                  <span
                    className={
                      isCompleted
                        ? "text-green-700 font-medium"
                        : isCurrent
                        ? "text-blue-700 font-medium"
                        : "text-gray-500"
                    }
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 推定残り時間 */}
          {estimatedTimeRemaining !== null && (
            <div className="text-center text-gray-600">
              <p>あと約{Math.ceil(estimatedTimeRemaining / 60)}分かかります</p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error || "データが見つかりません"}</p>
          <button
            onClick={() => router.push(`/dashboard`)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  const { article, analysisResults, analysisRuns } = data;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {article.title || article.url}
            </h1>
            <p className="text-sm text-gray-500 mb-4 break-all">{article.url}</p>
            <div className="flex items-center gap-4 text-sm">
              {article.current_average_position !== null && (
                <span className="text-gray-600">
                  {t("dashboard.articles.averagePosition")}:{" "}
                  <span className="font-semibold">{article.current_average_position.toFixed(1)}位</span>
                </span>
              )}
              {article.is_monitoring && (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                  {t("dashboard.articles.monitoring")}
                </span>
              )}
              {article.is_fixed && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                  対応完了
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAnalysis}
              disabled={analyzing || !article.site_id}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {analyzing ? t("analysis.analyzing") : t("analysis.startAnalysis")}
            </button>
            {!article.is_fixed && (
              <div className="group relative inline-block">
              <button
                onClick={handleMarkAsFixed}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                  対応完了にする
              </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 whitespace-normal">
                  {t("dashboard.articles.markAsFixedTooltip")}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                    <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={handleDeleteArticle}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              削除
            </button>
          </div>
        </div>
      </div>

      {/* 分析結果履歴 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">分析結果履歴</h2>
        </div>
        <div className="divide-y">
          {analysisResults.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <p>分析結果がありません</p>
            </div>
          ) : (
            analysisResults.map((result) => (
              <div key={result.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <span className="text-sm text-gray-600">
                        {new Date(result.created_at).toLocaleDateString()}
                      </span>
                      {result.average_position !== null && (
                        <span className="text-sm text-gray-600">
                          {t("dashboard.articles.averagePosition")}: {result.average_position.toFixed(1)}位
                        </span>
                      )}
                      {result.position_change !== null && (
                        <span
                          className={`text-sm ${
                            result.position_change > 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {result.position_change > 0 ? "+" : ""}
                          {result.position_change.toFixed(1)}位
                        </span>
                      )}
                      {result.competitor_count !== null && (
                        <span className="text-sm text-gray-500">
                          競合: {result.competitor_count}件
                        </span>
                      )}
                    </div>
                    {result.analyzed_keywords && result.analyzed_keywords.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 mb-1">分析キーワード:</p>
                        <div className="flex flex-wrap gap-1">
                          {result.analyzed_keywords.slice(0, 5).map((keyword, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                          {result.analyzed_keywords.length > 5 && (
                            <span className="px-2 py-1 text-xs text-gray-500">
                              +{result.analyzed_keywords.length - 5}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {result.detailed_result_storage_key && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    {loadingDetailed.has(result.id) ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-sm text-gray-600">詳細データを読み込み中...</p>
                      </div>
                    ) : detailedData[result.id]?.error ? (
                      <p className="text-sm text-red-600">{detailedData[result.id].error}</p>
                    ) : detailedData[result.id] ? (
                      <div className="space-y-4">
                        {detailedData[result.id].semanticDiffAnalysis?.semanticAnalysis?.whyCompetitorsRankHigher && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2">なぜ競合が上位なのか</h4>
                            <p className="text-sm text-gray-700">
                              {detailedData[result.id].semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher}
                            </p>
                          </div>
                        )}
                        {detailedData[result.id].semanticDiffAnalysis?.semanticAnalysis?.recommendedAdditions && 
                         detailedData[result.id].semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2">
                              追加すべき項目 ({detailedData[result.id].semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length}個)
                            </h4>
                            <div className="space-y-3 mt-2">
                              {detailedData[result.id].semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.map(
                                (rec: any, i: number) => (
                                  <div key={i} className="bg-yellow-50 p-3 rounded border border-yellow-300">
                                    <p className="font-semibold text-sm">{rec.section || `項目 ${i + 1}`}</p>
                                    {rec.reason && (
                                      <p className="text-xs text-gray-600 mt-1">理由: {rec.reason}</p>
                                    )}
                                    {rec.content && (
                                      <p className="text-sm mt-2">{rec.content}</p>
                                    )}
                                    {rec.competitorUrls && rec.competitorUrls.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-yellow-200">
                                        <p className="text-xs text-gray-600 font-semibold mb-1">参考: この内容が記載されている競合サイト</p>
                                        <ul className="list-none space-y-1">
                                          {rec.competitorUrls.map((url: string, urlIndex: number) => (
                                            <li key={urlIndex}>
                                              <a 
                                                href={url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-600 hover:underline break-all"
                                              >
                                                {url}
                                              </a>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

