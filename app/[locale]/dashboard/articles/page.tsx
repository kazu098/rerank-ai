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
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [alertSettings, setAlertSettings] = useState({
    position_drop_threshold: 2.0,
    keyword_drop_threshold: 10,
    comparison_days: 7,
    notification_frequency: 'daily' as 'daily' | 'weekly' | 'none',
  });
  const [savingAlertSettings, setSavingAlertSettings] = useState(false);

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
      fetchAlertSettings();
    }
  }, [filter, sortBy]);

  const fetchAlertSettings = async () => {
    try {
      const response = await fetch("/api/alert-settings");
      if (response.ok) {
        const data = await response.json();
        setAlertSettings(data);
      }
    } catch (err) {
      console.error("[Articles] Error fetching alert settings:", err);
    }
  };

  const handleSaveAlertSettings = async () => {
    try {
      setSavingAlertSettings(true);
      const response = await fetch("/api/alert-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alertSettings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("alertSettings.saveFailed"));
      }

      setShowAlertSettings(false);
    } catch (err: any) {
      console.error("[Articles] Error saving alert settings:", err);
      alert(err.message || t("alertSettings.saveFailed"));
    } finally {
      setSavingAlertSettings(false);
    }
  };

  const handleResetAlertSettings = () => {
    setAlertSettings({
      position_drop_threshold: 2.0,
      keyword_drop_threshold: 10,
      comparison_days: 7,
      notification_frequency: 'daily',
    });
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAlertSettings(true)}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {t("alertSettings.title")}
            </button>
          <Link
            href={`/${locale}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
              {t("dashboard.articles.startNewAnalysis")}
          </Link>
          </div>
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
                    <div className="flex items-center gap-1">
                      <span>{t("dashboard.articles.averagePosition")}</span>
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
                          {t("dashboard.articles.averagePositionDescription")}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -mb-1">
                            <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
                          </div>
                        </div>
                      </div>
                    </div>
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

      {/* アラート設定モーダル */}
      {showAlertSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAlertSettings(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">{t("alertSettings.title")}</h2>
                <button
                  onClick={() => setShowAlertSettings(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-6">{t("alertSettings.description")}</p>

              <div className="space-y-6">
                {/* 急落の判定条件 */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {t("alertSettings.dropConditions.title")}
                  </h3>

                  {/* 平均順位の下落幅 */}
                  <div className="mb-4">
                    <label htmlFor="position_drop_threshold" className="block text-sm font-medium text-gray-700 mb-2">
                      {t("alertSettings.dropConditions.positionDropThreshold")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        id="position_drop_threshold"
                        min="0"
                        step="0.5"
                        value={alertSettings.position_drop_threshold}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            position_drop_threshold: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      <span className="text-sm text-gray-600">{t("alertSettings.dropConditions.positionsAbove")}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {t("alertSettings.dropConditions.positionDropThresholdDescription")}
                    </p>
                  </div>

                  {/* 特定キーワードの転落条件 */}
                  <div>
                    <label htmlFor="keyword_drop_threshold" className="block text-sm font-medium text-gray-700 mb-2">
                      {t("alertSettings.dropConditions.keywordDropThreshold")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        id="keyword_drop_threshold"
                        min="1"
                        step="1"
                        value={alertSettings.keyword_drop_threshold}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            keyword_drop_threshold: parseInt(e.target.value) || 10,
                          })
                        }
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      <span className="text-sm text-gray-600">{t("alertSettings.dropConditions.positionsOrBelow")}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {t("alertSettings.dropConditions.keywordDropThresholdDescription")}
                    </p>
                  </div>
                </div>

                {/* 比較期間 */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {t("alertSettings.comparisonPeriod.title")}
                  </h3>
                  <div>
                    <label htmlFor="comparison_days" className="block text-sm font-medium text-gray-700 mb-2">
                      {t("alertSettings.comparisonPeriod.days")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        id="comparison_days"
                        min="1"
                        step="1"
                        value={alertSettings.comparison_days}
                        onChange={(e) =>
                          setAlertSettings({
                            ...alertSettings,
                            comparison_days: parseInt(e.target.value) || 7,
                          })
                        }
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      <span className="text-sm text-gray-600">{t("alertSettings.comparisonPeriod.daysSuffix")}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {t("alertSettings.comparisonPeriod.description")}
                    </p>
                  </div>
                </div>

                {/* 通知頻度 */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {t("alertSettings.notificationFrequency.title")}
                  </h3>
                  <div className="space-y-2">
                    {(['daily', 'weekly', 'none'] as const).map((frequency) => (
                      <label key={frequency} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="notification_frequency"
                          value={frequency}
                          checked={alertSettings.notification_frequency === frequency}
                          onChange={(e) =>
                            setAlertSettings({
                              ...alertSettings,
                              notification_frequency: e.target.value as 'daily' | 'weekly' | 'none',
                            })
                          }
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="text-sm text-gray-700">
                          {t(`alertSettings.notificationFrequency.${frequency}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {t("alertSettings.notificationFrequency.description")}
                  </p>
                </div>
              </div>

              {/* ボタン */}
              <div className="mt-6 flex gap-4">
                <button
                  onClick={handleSaveAlertSettings}
                  disabled={savingAlertSettings}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {savingAlertSettings ? t("common.saving") : t("common.save")}
                </button>
                <button
                  onClick={handleResetAlertSettings}
                  disabled={savingAlertSettings}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
                >
                  {t("alertSettings.resetToDefault")}
                </button>
                <button
                  onClick={() => setShowAlertSettings(false)}
                  disabled={savingAlertSettings}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors ml-auto"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

