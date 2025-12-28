"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

interface Article {
  id: string;
  url: string;
  title: string | null;
  current_average_position: number | null;
  previous_average_position: number | null;
  last_analyzed_at: string | null;
  is_monitoring: boolean;
  is_fixed: boolean | null;
  latestAnalysis: {
    id: string;
    average_position: number | null;
    previous_average_position: number | null;
    position_change: number | null;
    created_at: string;
  } | null;
  notificationStatus?: {
    email: boolean | null; // true: 有効, false: 無効, null: デフォルト設定を使用
    slack: boolean | null; // true: 有効, false: 無効, null: デフォルト設定を使用
  };
}

export default function ArticlesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "monitoring" | "fixed">("all");
  const [sortBy, setSortBy] = useState<"date" | "position" | "title">("date");
  const [fetchingTitleIds, setFetchingTitleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}`);
      return;
    }

    if (status === "authenticated") {
      fetchArticles();
    }
  }, [status, filter, router, locale]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/dashboard/data");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("dashboard.articles.fetchArticlesFailed"));
      }

      const data = await response.json();
      let filteredArticles = data.articles || [];

      // フィルタリング
      if (filter === "monitoring") {
        filteredArticles = filteredArticles.filter((a: Article) => a.is_monitoring);
      } else if (filter === "fixed") {
        filteredArticles = filteredArticles.filter((a: Article) => a.is_fixed);
      }

      // ソート
      filteredArticles.sort((a: Article, b: Article) => {
        if (sortBy === "date") {
          const dateA = a.last_analyzed_at ? new Date(a.last_analyzed_at).getTime() : 0;
          const dateB = b.last_analyzed_at ? new Date(b.last_analyzed_at).getTime() : 0;
          return dateB - dateA; // 新しい順
        } else if (sortBy === "position") {
          const posA = a.latestAnalysis?.average_position ?? 999;
          const posB = b.latestAnalysis?.average_position ?? 999;
          return posA - posB; // 順位が良い順
        } else if (sortBy === "title") {
          const titleA = a.title || a.url;
          const titleB = b.title || b.url;
          return titleA.localeCompare(titleB);
        }
        return 0;
      });

      setArticles(filteredArticles);
    } catch (err: any) {
      console.error("[Articles] Error:", err);
      setError(err.message || t("dashboard.articles.errorOccurred"));
    } finally {
      setLoading(false);
    }
  };

  const fetchArticleTitle = async (articleId: string) => {
    // 既に取得中の場合はスキップ
    if (fetchingTitleIds.has(articleId)) {
      return;
    }

    setFetchingTitleIds((prev) => new Set(prev).add(articleId));
    try {
      const response = await fetch("/api/articles/fetch-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("dashboard.articles.fetchTitleFailed"));
      }

      // APIレスポンスからタイトルを取得してUIを更新
      const data = await response.json();
      setArticles((prevArticles) =>
        prevArticles.map((a) =>
          a.id === articleId
            ? { ...a, title: data.title }
            : a
        )
      );
    } catch (error: any) {
      console.error("Failed to fetch article title:", error);
      alert(`${t("dashboard.articles.fetchTitleFailed")}: ${error.message}`);
    } finally {
      setFetchingTitleIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(articleId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchArticles();
    }
  }, [filter, sortBy]);

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchArticles}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t("dashboard.articles.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダーとフィルタ */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.articles.title")}</h1>
          <Link
            href={`/${locale}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            {t("dashboard.articles.startNewAnalysis")}
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {/* フィルタ */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{t("dashboard.articles.filter")}:</span>
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded text-sm ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("dashboard.articles.all")} ({articles.length})
            </button>
            <button
              onClick={() => setFilter("monitoring")}
              className={`px-3 py-1 rounded text-sm ${
                filter === "monitoring"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("dashboard.articles.monitoring")} ({articles.filter((a) => a.is_monitoring).length})
            </button>
            <button
              onClick={() => setFilter("fixed")}
              className={`px-3 py-1 rounded text-sm ${
                filter === "fixed"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("dashboard.articles.fixed")} ({articles.filter((a) => a.is_fixed).length})
            </button>
          </div>

          {/* ソート */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-600">{t("dashboard.articles.sortBy")}:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "position" | "title")}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="date">{t("dashboard.articles.sortByDate")}</option>
              <option value="position">{t("dashboard.articles.sortByPosition")}</option>
              <option value="title">{t("dashboard.articles.sortByTitle")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* 記事一覧テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
          {articles.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
            <p>{t("dashboard.articles.noArticlesInList")}</p>
              <Link
                href={`/${locale}`}
                className="mt-4 inline-block text-blue-600 hover:text-blue-700"
              >
              {t("dashboard.articles.startNewAnalysis")}
              </Link>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-80">
                    {t("dashboard.articles.titleUrl")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("dashboard.articles.averagePosition")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("dashboard.articles.previousPosition")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("dashboard.articles.positionChange")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("dashboard.articles.lastAnalyzed")}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("dashboard.articles.emailNotification")}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("dashboard.articles.slackNotification")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>{t("dashboard.articles.autoCheck")}</span>
                      <div className="group relative inline-block">
                        <svg
                          className="w-4 h-4 text-gray-400 cursor-help"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 whitespace-normal">
                          {t("dashboard.articles.autoCheckDescription")}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -mb-1">
                            <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {articles.map((article) => (
                  <tr
                    key={article.id}
                    onClick={() => router.push(`/${locale}/dashboard/articles/${article.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 w-80">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 break-words line-clamp-2">
                      {article.title || article.url}
                          </div>
                          <div className="text-sm text-gray-500 truncate mt-1">
                            {article.url}
                          </div>
                        </div>
                        {!article.title && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await fetchArticleTitle(article.id);
                            }}
                            disabled={fetchingTitleIds.has(article.id)}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex-shrink-0"
                            title={t("article.fetchingTitle")}
                          >
                            {fetchingTitleIds.has(article.id) ? t("article.fetchingTitleInProgress") : t("article.fetchingTitle")}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {article.latestAnalysis &&
                        article.latestAnalysis.average_position !== null &&
                        article.latestAnalysis.average_position !== undefined
                          ? `${article.latestAnalysis.average_position.toFixed(1)}${t("dashboard.articles.rankUnit")}`
                          : t("dashboard.articles.noData")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {article.latestAnalysis &&
                        article.latestAnalysis.previous_average_position !== null &&
                        article.latestAnalysis.previous_average_position !== undefined
                          ? `${article.latestAnalysis.previous_average_position.toFixed(1)}${t("dashboard.articles.rankUnit")}`
                          : t("dashboard.articles.noDataDash")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {article.latestAnalysis &&
                      article.latestAnalysis.position_change !== null &&
                      article.latestAnalysis.position_change !== undefined ? (
                        <div
                          className={`text-sm font-semibold ${
                              article.latestAnalysis.position_change > 0
                                ? "text-red-600"
                                : "text-green-600"
                          }`}
                        >
                          {article.latestAnalysis.position_change > 0 ? "+" : ""}
                          {article.latestAnalysis.position_change.toFixed(1)}{t("dashboard.articles.rankUnit")}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">-</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {article.last_analyzed_at
                          ? new Date(article.last_analyzed_at).toLocaleDateString()
                          : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const currentStatus = article.notificationStatus?.email;
                          const newStatus = currentStatus === true ? false : true;
                          
                          // 楽観的更新: 即座にUIを更新
                          setArticles((prevArticles) =>
                            prevArticles.map((a) =>
                              a.id === article.id
                                ? {
                                    ...a,
                                    notificationStatus: {
                                      email: newStatus,
                                      slack: a.notificationStatus?.slack ?? null,
                                    },
                                  }
                                : a
                            )
                          );

                          try {
                            const response = await fetch(
                              `/api/articles/${article.id}/notification`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  channel: "email",
                                  enabled: newStatus,
                                }),
                              }
                            );
                            if (!response.ok) {
                              // エラーの場合、元の状態に戻す
                              setArticles((prevArticles) =>
                                prevArticles.map((a) =>
                                  a.id === article.id
                                    ? {
                                        ...a,
                                        notificationStatus: {
                                          email: currentStatus ?? null,
                                          slack: a.notificationStatus?.slack ?? null,
                                        },
                                      }
                                    : a
                                )
                              );
                              const errorData = await response.json();
                                alert(errorData.error || t("dashboard.articles.updateEmailNotificationFailed"));
                            }
                          } catch (error: any) {
                            // エラーの場合、元の状態に戻す
                            setArticles((prevArticles) =>
                              prevArticles.map((a) =>
                                a.id === article.id
                                  ? {
                                      ...a,
                                      notificationStatus: {
                                        email: currentStatus ?? null,
                                        slack: a.notificationStatus?.slack ?? null,
                                      },
                                    }
                                  : a
                              )
                            );
                            console.error("Failed to toggle email notification:", error);
                            alert(`${t("dashboard.articles.updateEmailNotificationFailed")}: ${error.message}`);
                          }
                        }}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        style={{
                          backgroundColor:
                            article.notificationStatus?.email === true
                              ? "#3b82f6"
                              : article.notificationStatus?.email === false
                              ? "#d1d5db"
                              : "#e5e7eb",
                        }}
                        title={
                          article.notificationStatus?.email === true
                            ? t("dashboard.articles.emailNotificationOn")
                            : article.notificationStatus?.email === false
                            ? t("dashboard.articles.emailNotificationOff")
                            : t("dashboard.articles.emailNotificationDefault")
                        }
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            article.notificationStatus?.email === true
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const currentStatus = article.notificationStatus?.slack;
                          const newStatus = currentStatus === true ? false : true;
                          
                          // 楽観的更新: 即座にUIを更新
                          setArticles((prevArticles) =>
                            prevArticles.map((a) =>
                              a.id === article.id
                                ? {
                                    ...a,
                                    notificationStatus: {
                                      email: a.notificationStatus?.email ?? null,
                                      slack: newStatus,
                                    },
                                  }
                                : a
                            )
                          );

                          try {
                            const response = await fetch(
                              `/api/articles/${article.id}/notification`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  channel: "slack",
                                  enabled: newStatus,
                                }),
                              }
                            );
                            if (!response.ok) {
                              // エラーの場合、元の状態に戻す
                              setArticles((prevArticles) =>
                                prevArticles.map((a) =>
                                  a.id === article.id
                                    ? {
                                        ...a,
                                        notificationStatus: {
                                          email: a.notificationStatus?.email ?? null,
                                          slack: currentStatus ?? null,
                                        },
                                      }
                                    : a
                                )
                              );
                              const errorData = await response.json();
                              alert(errorData.error || t("dashboard.articles.updateSlackNotificationFailed"));
                            }
                          } catch (error: any) {
                            // エラーの場合、元の状態に戻す
                            setArticles((prevArticles) =>
                              prevArticles.map((a) =>
                                a.id === article.id
                                  ? {
                                      ...a,
                                      notificationStatus: {
                                        email: a.notificationStatus?.email ?? null,
                                        slack: currentStatus ?? null,
                                      },
                                    }
                                  : a
                              )
                            );
                            console.error("Failed to toggle Slack notification:", error);
                            alert(`${t("dashboard.articles.updateSlackNotificationFailed")}: ${error.message}`);
                          }
                        }}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                        style={{
                          backgroundColor:
                            article.notificationStatus?.slack === true
                              ? "#9333ea"
                              : article.notificationStatus?.slack === false
                              ? "#d1d5db"
                              : "#e5e7eb",
                        }}
                        title={
                          article.notificationStatus?.slack === true
                            ? t("dashboard.articles.slackNotificationOn")
                            : article.notificationStatus?.slack === false
                            ? t("dashboard.articles.slackNotificationOff")
                            : t("dashboard.articles.slackNotificationDefault")
                        }
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            article.notificationStatus?.slack === true
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const newMonitoringStatus = !article.is_monitoring;
                            
                            // 楽観的更新: 即座にUIを更新
                            setArticles((prevArticles) =>
                              prevArticles.map((a) =>
                                a.id === article.id
                                  ? { ...a, is_monitoring: newMonitoringStatus }
                                  : a
                              )
                            );

                            try {
                              const response = await fetch(
                                `/api/articles/${article.id}/monitoring`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    enabled: newMonitoringStatus,
                                  }),
                                }
                              );
                              if (!response.ok) {
                                // エラーの場合、元の状態に戻す
                                setArticles((prevArticles) =>
                                  prevArticles.map((a) =>
                                    a.id === article.id
                                      ? { ...a, is_monitoring: article.is_monitoring }
                                      : a
                                  )
                                );
                                const errorData = await response.json();
                                alert(errorData.error || t("dashboard.articles.updateMonitoringStatusFailed"));
                              }
                            } catch (error: any) {
                              // エラーの場合、元の状態に戻す
                              setArticles((prevArticles) =>
                                prevArticles.map((a) =>
                                  a.id === article.id
                                    ? { ...a, is_monitoring: article.is_monitoring }
                                    : a
                                )
                              );
                              console.error("Failed to update monitoring status:", error);
                              alert(`${t("dashboard.articles.updateMonitoringStatusFailed")}: ${error.message}`);
                            }
                          }}
                          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          style={{
                            backgroundColor: article.is_monitoring ? "#3b82f6" : "#d1d5db",
                          }}
                          title={
                            article.is_monitoring
                              ? t("dashboard.articles.stopMonitoring")
                              : t("dashboard.articles.startMonitoring")
                          }
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              article.is_monitoring ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                        {article.is_fixed && (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                            {t("dashboard.articles.fixed")}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
          )}
      </div>
    </div>
  );
}

