"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { getDetailedAnalysisData } from "@/lib/db/analysis-results";

interface ArticleDetail {
  article: {
    id: string;
    url: string;
    title: string | null;
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
  const articleId = params.id;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}`);
      return;
    }

    if (status === "authenticated" && articleId) {
      fetchArticleDetail();
    }
  }, [status, articleId, router, locale]);

  const fetchArticleDetail = async () => {
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
  };

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

      router.push(`/${locale}/dashboard`);
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
            onClick={() => router.push(`/${locale}/dashboard`)}
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
                  修正済み
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!article.is_fixed && (
              <button
                onClick={handleMarkAsFixed}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                修正済みにする
              </button>
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

