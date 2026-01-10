"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getDetailedAnalysisData } from "@/lib/db/analysis-results";
import { KeywordTimeSeriesChart } from "@/components/landing/KeywordTimeSeriesChart";

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
  const pathname = usePathname();
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
  
  // 記事改善関連の状態
  const [improvementLoading, setImprovementLoading] = useState<Record<string, boolean>>({});
  const [improvementData, setImprovementData] = useState<Record<string, any>>({});
  const [improvementError, setImprovementError] = useState<Record<string, string>>({});
  const [showImprovementModal, setShowImprovementModal] = useState<Record<string, boolean>>({});
  
  // キーワード手動選択関連の状態
  const [showKeywordSelectModal, setShowKeywordSelectModal] = useState(false);
  const [keywords, setKeywords] = useState<Array<{ keyword: string; position: number; impressions: number; clicks: number; ctr: number }>>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [loadingKeywords, setLoadingKeywords] = useState(false);

  // プラン制限関連
  const [userPlan, setUserPlan] = useState<any>(null);
  const [usage, setUsage] = useState<{ analyses_this_month: number; articles: number } | null>(null);

  const fetchArticleDetail = useCallback(async (skipCache: boolean = false) => {
    if (!articleId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/articles/${articleId}`, {
        ...(skipCache && { cache: 'no-store' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "記事の取得に失敗しました");
      }

      const articleData = await response.json();
      setData(articleData);

      // 存在しない分析結果IDの改善案データをクリア
      // これにより、前回の分析結果の改善案が表示されないようにする
      const currentAnalysisResultIds = new Set(
        (articleData.analysisResults || []).map((r: any) => r.id)
      );
      
      setImprovementData((prev) => {
        const next: Record<string, any> = {};
        Object.keys(prev).forEach((id) => {
          if (currentAnalysisResultIds.has(id)) {
            next[id] = prev[id];
          }
        });
        return next;
      });
      
      setShowImprovementModal((prev) => {
        const next: Record<string, boolean> = {};
        Object.keys(prev).forEach((id) => {
          if (currentAnalysisResultIds.has(id) && prev[id]) {
            next[id] = prev[id];
          }
        });
        return next;
      });
      
      setImprovementLoading((prev) => {
        const next: Record<string, boolean> = {};
        Object.keys(prev).forEach((id) => {
          if (currentAnalysisResultIds.has(id) && prev[id]) {
            next[id] = prev[id];
          }
        });
        return next;
      });
      
      setImprovementError((prev) => {
        const next: Record<string, string> = {};
        Object.keys(prev).forEach((id) => {
          if (currentAnalysisResultIds.has(id)) {
            next[id] = prev[id];
          }
        });
        return next;
      });

      // 分析結果の詳細データは遅延読み込み（表示時またはクリック時に取得）
      // 初期表示時は基本情報のみを取得して高速化
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

  // プラン情報と使用量を取得
  useEffect(() => {
    if (status === "authenticated" && session?.userId) {
      Promise.all([
        fetch("/api/users/me"),
        fetch("/api/billing/usage"),
      ])
        .then(async ([userResponse, usageResponse]) => {
          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUserPlan(userData.user);
          }
          if (usageResponse.ok) {
            const usageData = await usageResponse.json();
            setUsage(usageData.usage);
          }
        })
        .catch((err) => {
          console.error("[Plan Info] Error fetching plan info:", err);
        });
    }
  }, [status, session?.userId]);

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

    // ホームページの記事分析タブに遷移（記事URLとanalyze=trueパラメータ付き）
    // routerは既にロケールプレフィックスを自動処理するため、/だけを指定
    const articleUrl = encodeURIComponent(data.article.url);
    router.push(`/?articleUrl=${articleUrl}&analyze=true`);
  }, [data, analyzing, router]);

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

  const handleOpenKeywordSelectModal = async () => {
    if (!data?.article || !data.article.site_id) return;
    
    setShowKeywordSelectModal(true);
    setLoadingKeywords(true);
    setSelectedKeywords(new Set());
    
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
      
      // GSCデータからキーワード一覧を取得
      const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const startDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      
      const keywordsResponse = await fetch(
        `/api/gsc/keywords?siteUrl=${encodeURIComponent(siteUrl)}&pageUrl=${encodeURIComponent(pageUrl)}&startDate=${startDate}&endDate=${endDate}`
      );
      
      if (!keywordsResponse.ok) {
        throw new Error("キーワードデータの取得に失敗しました");
      }
      
      const keywordsData = await keywordsResponse.json();
      const keywordList = (keywordsData.rows || []).map((row: any) => ({
        keyword: row.keys[0],
        position: row.position,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
      })).filter((kw: any) => kw.impressions >= 1); // インプレッション1以上を表示
      
      // インプレッション数でソート（降順）
      keywordList.sort((a: any, b: any) => b.impressions - a.impressions);
      
      setKeywords(keywordList);
    } catch (err: any) {
      console.error("[Keyword Select] Error:", err);
      setError(err.message || "キーワードデータの取得に失敗しました");
    } finally {
      setLoadingKeywords(false);
    }
  };

  const handleGenerateImprovement = async (analysisResultId: string) => {
    try {
      setImprovementLoading((prev) => ({ ...prev, [analysisResultId]: true }));
      setImprovementError((prev) => {
        const next = { ...prev };
        delete next[analysisResultId];
        return next;
      });

      const response = await fetch("/api/article-improvement/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisResultId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "修正案の生成に失敗しました");
      }

      const result = await response.json();
      setImprovementData((prev) => ({ ...prev, [analysisResultId]: result }));
      setShowImprovementModal((prev) => ({ ...prev, [analysisResultId]: true }));
    } catch (err: any) {
      console.error("[Article Detail] Error generating improvement:", err);
      setImprovementError((prev) => ({ ...prev, [analysisResultId]: err.message }));
    } finally {
      setImprovementLoading((prev) => {
        const next = { ...prev };
        delete next[analysisResultId];
        return next;
      });
    }
  };

  const handleCopyContent = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(t("dashboard.articles.improvement.copied"));
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("コピーに失敗しました");
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
    if (!articleId || !data) return;

    // 楽観的更新: 即座にUIを更新
    const previousIsFixed = data.article.is_fixed;
    const previousFixedAt = data.article.fixed_at;
    setData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        article: {
          ...prevData.article,
          is_fixed: true,
          fixed_at: new Date().toISOString(),
        },
      };
    });

    try {
      const response = await fetch(`/api/articles/${articleId}/mark-as-fixed`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        // エラーの場合、元の状態に戻す
        setData((prevData) => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            article: {
              ...prevData.article,
              is_fixed: previousIsFixed,
              fixed_at: previousFixedAt,
            },
          };
        });
        const errorData = await response.json();
        throw new Error(errorData.error || "修正済みフラグの更新に失敗しました");
      }

      // データを再取得して確実に最新の状態にする（キャッシュを無効化）
      await fetchArticleDetail(true);
    } catch (err: any) {
      // エラーの場合、元の状態に戻す（楽観的更新で既に戻しているが、念のため）
      setData((prevData) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          article: {
            ...prevData.article,
            is_fixed: previousIsFixed,
            fixed_at: previousFixedAt,
          },
        };
      });
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

  // 今日既に分析されているかチェック
  const isAnalyzedToday = (() => {
    if (!article.last_analyzed_at) return false;
    const lastAnalyzed = new Date(article.last_analyzed_at);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lastAnalyzedStart = new Date(
      lastAnalyzed.getFullYear(),
      lastAnalyzed.getMonth(),
      lastAnalyzed.getDate()
    );
    return lastAnalyzedStart.getTime() === todayStart.getTime();
  })();

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
            <div className="flex items-center gap-4 text-sm flex-wrap">
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
            {/* プラン制限超過の警告 */}
            {userPlan?.plan && usage && (() => {
              const analysesLimit = userPlan.plan.max_analyses_per_month;
              const isFreePlan = userPlan.plan.name === "free";
              const isAnalysesExceeded = analysesLimit !== null && usage.analyses_this_month >= analysesLimit;
              
              if (isAnalysesExceeded) {
                return (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-xs font-semibold text-yellow-800">
                        {isFreePlan ? t("errors.analysesLimitExceededTotal") : t("errors.analysesLimitExceeded")}
                      </p>
                    </div>
                    <p className="text-xs text-yellow-700 mb-2">
                      {t("billing.usage", {
                        current: usage.analyses_this_month,
                        limit: analysesLimit ?? t("billing.unlimited")
                      })}
                    </p>
                    <Link
                      href="/#pricing"
                      className="text-xs font-semibold text-yellow-800 hover:text-yellow-900"
                    >
                      {t("billing.upgradePlan")} →
                    </Link>
                  </div>
                );
              }
              return null;
            })()}
            <div className="group relative inline-block">
              <button
                onClick={handleStartAnalysis}
                disabled={(() => {
                  if (analyzing || !article.site_id || isAnalyzedToday) return true;
                  if (userPlan?.plan && usage) {
                    const analysesLimit = userPlan.plan.max_analyses_per_month;
                    if (analysesLimit !== null && usage.analyses_this_month >= analysesLimit) {
                      return true;
                    }
                  }
                  return false;
                })()}
                className="px-4 py-2 bg-white text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed"
              >
                {analyzing ? t("analysis.analyzing") : t("analysis.startAnalysis")}
              </button>
              {isAnalyzedToday && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 whitespace-normal">
                  {t("dashboard.articles.analyzedTodayTooltip")}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                    <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
            {!article.is_fixed && (
              <div className="group relative inline-block">
              <button
                onClick={handleMarkAsFixed}
                className="px-4 py-2 bg-white text-green-600 border border-green-600 rounded hover:bg-green-50 text-sm"
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
              className="px-4 py-2 bg-white text-red-600 border border-red-600 rounded hover:bg-red-50 text-sm"
            >
              削除
            </button>
          </div>
        </div>
      </div>

      {/* 分析結果履歴 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">分析結果履歴</h2>
          {analysisResults.length > 0 && (() => {
            // 最新の分析結果を取得
            const latestResult = analysisResults[0];
            const hasRecommendedAdditions = latestResult.detailed_result_storage_key && 
              detailedData[latestResult.id]?.semanticDiffAnalysis?.semanticAnalysis?.recommendedAdditions &&
              detailedData[latestResult.id].semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length > 0;
            
            return hasRecommendedAdditions ? (
              <button
                onClick={() => handleGenerateImprovement(latestResult.id)}
                disabled={improvementLoading[latestResult.id]}
                className="relative px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {improvementLoading[latestResult.id] ? t("dashboard.articles.improvement.loading") : t("dashboard.articles.improveArticle")}
                {/* AIバッジ */}
                {!improvementLoading[latestResult.id] && (
                  <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-bold text-white bg-orange-500 rounded-full shadow-md">
                    AI
                  </span>
                )}
              </button>
            ) : null;
          })()}
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
                    {!detailedData[result.id] && !loadingDetailed.has(result.id) ? (
                      <button
                        onClick={() => {
                          if (result.detailed_result_storage_key) {
                            fetchDetailedAnalysis(result.id, result.detailed_result_storage_key);
                          }
                        }}
                        className="w-full px-4 py-2 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                      >
                        詳細を見る
                      </button>
                    ) : loadingDetailed.has(result.id) ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-sm text-gray-600">詳細データを読み込み中...</p>
                      </div>
                    ) : detailedData[result.id]?.error ? (
                      <p className="text-sm text-red-600">{detailedData[result.id].error}</p>
                    ) : detailedData[result.id] ? (
                      <div className="space-y-4">
                        {/* キーワード時系列グラフ */}
                        {detailedData[result.id].keywordTimeSeries && detailedData[result.id].keywordTimeSeries.length > 0 && (
                          <div className="mb-6">
                            <KeywordTimeSeriesChart keywordTimeSeries={detailedData[result.id].keywordTimeSeries} />
                          </div>
                        )}
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
                            {improvementError[result.id] && (
                              <div className="mt-2 mb-2 p-2 bg-red-50 border border-red-300 rounded text-sm text-red-600">
                                {improvementError[result.id]}
                              </div>
                            )}
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

      {/* キーワード選択モーダル */}
      {showKeywordSelectModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowKeywordSelectModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {t("dashboard.articles.keywordSelect.title")}
                </h2>
                <button
                  onClick={() => setShowKeywordSelectModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                {t("dashboard.articles.keywordSelect.description")}
              </p>
              
              {loadingKeywords ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">{t("dashboard.articles.keywordSelect.loading")}</p>
                </div>
              ) : keywords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {t("dashboard.articles.keywordSelect.noKeywords")}
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {t("dashboard.articles.keywordSelect.selectedCount", { count: selectedKeywords.size, max: 3 })}
                      </span>
                      {selectedKeywords.size > 0 && (
                        <button
                          onClick={() => setSelectedKeywords(new Set())}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {t("dashboard.articles.keywordSelect.clearAll")}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.select")}
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.keyword")}
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.position")}
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.impressions")}
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.clicks")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {keywords.map((kw, index) => {
                          const isSelected = selectedKeywords.has(kw.keyword);
                          const maxKeywords = 3; // 記事詳細ページでは固定値3を使用
                          const isDisabled = !isSelected && selectedKeywords.size >= maxKeywords;
                          
                          return (
                            <tr
                              key={index}
                              className={`hover:bg-gray-50 ${isDisabled ? "opacity-50" : ""}`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isDisabled}
                                  onChange={() => {
                                    const newSelected = new Set(selectedKeywords);
                                    if (isSelected) {
                                      newSelected.delete(kw.keyword);
                                    } else if (newSelected.size < maxKeywords) {
                                      newSelected.add(kw.keyword);
                                    }
                                    setSelectedKeywords(newSelected);
                                  }}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {kw.keyword}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {kw.position.toFixed(1)}位
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {kw.impressions.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {kw.clicks.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowKeywordSelectModal(false);
                        setSelectedKeywords(new Set());
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={() => {
                        if (selectedKeywords.size > 0) {
                          setShowKeywordSelectModal(false);
                          handleStartAnalysis();
                        }
                      }}
                      disabled={selectedKeywords.size === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                      {t("dashboard.articles.keywordSelect.startAnalysis")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 記事改善案モーダル */}
      {Object.entries(showImprovementModal).map(([analysisResultId, isOpen]) => {
        if (!isOpen || !improvementData[analysisResultId]) return null;

        const improvement = improvementData[analysisResultId].improvement;

        return (
          <div
            key={analysisResultId}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setShowImprovementModal((prev) => ({ ...prev, [analysisResultId]: false }))}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {t("dashboard.articles.improvement.title")}
                  </h2>
                  <button
                    onClick={() => setShowImprovementModal((prev) => ({ ...prev, [analysisResultId]: false }))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {improvement.changes && improvement.changes.length > 0 ? (
                  <div className="space-y-6">
                    {improvement.changes.map((change: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="mb-4">
                          <h3 className="font-semibold text-lg mb-2">
                            {t("dashboard.articles.improvement.change")} {index + 1}
                          </h3>
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">{t("dashboard.articles.improvement.position")}:</span>{" "}
                            {change.simpleFormat?.position || `${change.position} ${change.target}`}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">{t("dashboard.articles.improvement.section")}:</span>{" "}
                            {change.simpleFormat?.section || change.target}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm text-gray-700">
                              {t("dashboard.articles.improvement.copyableFormat")}
                            </h4>
                            <button
                              onClick={() => handleCopyContent(change.content)}
                              className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                            >
                              {t("dashboard.articles.improvement.copyContent")}
                            </button>
                          </div>
                          <div className="bg-gray-50 p-3 rounded border border-gray-200">
                            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                              {change.content}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {t("dashboard.articles.improvement.error")}
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowImprovementModal((prev) => ({ ...prev, [analysisResultId]: false }))}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    {t("dashboard.articles.improvement.close")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

