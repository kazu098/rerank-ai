"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

interface DashboardData {
  articles: Array<{
    id: string;
    url: string;
    title: string | null;
    current_average_position: number | null;
    previous_average_position: number | null;
    last_analyzed_at: string | null;
    is_monitoring: boolean;
    latestAnalysis: {
      id: string;
      average_position: number | null;
      previous_average_position: number | null;
      position_change: number | null;
      created_at: string;
    } | null;
  }>;
  unreadNotifications: Array<{
    id: string;
    article_id: string;
    subject: string | null;
    summary: string | null;
    created_at: string;
    article: {
      id: string;
      url: string;
      title: string | null;
    } | null;
  }>;
  stats: {
    totalArticles: number;
    monitoringArticles: number;
    totalAnalyses: number;
  };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated" && session?.userId) {
      fetchDashboardData();
    }
  }, [status, session, router]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/dashboard/data");
      
      if (!response.ok) {
        throw new Error("ダッシュボードデータの取得に失敗しました");
      }

      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err: any) {
      console.error("[Dashboard] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
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

  if (status === "unauthenticated") {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <>
        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t("dashboard.stats.totalArticles")}</h3>
            <p className="text-3xl font-bold text-gray-900">{data.stats.totalArticles}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t("dashboard.stats.monitoringArticles")}</h3>
            <p className="text-3xl font-bold text-blue-600">{data.stats.monitoringArticles}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t("dashboard.stats.totalAnalyses")}</h3>
            <p className="text-3xl font-bold text-green-600">{data.stats.totalAnalyses}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* メインコンテンツ: 記事一覧 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.articles.title")}</h2>
              </div>
              <div className="divide-y">
                {data.articles.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <p>{t("dashboard.articles.noArticles")}</p>
                    <Link
                      href="/"
                      className="mt-4 inline-block text-blue-600 hover:text-blue-700"
                    >
                      {t("dashboard.articles.startAnalysisToRegister")}
                    </Link>
                  </div>
                ) : (
                  data.articles.map((article) => (
                    <div key={article.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 mb-1">
                            {article.title || article.url}
                          </h3>
                          <p className="text-sm text-gray-500 mb-2 truncate">
                            {article.url}
                          </p>
                          {article.latestAnalysis && (
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-600">
                                {t("dashboard.articles.averagePosition")}:{" "}
                                <span className="font-semibold">
                                  {article.latestAnalysis.average_position?.toFixed(1) || "N/A"}位
                                </span>
                              </span>
                              {article.latestAnalysis.previous_average_position !== null && (
                                <span className="text-gray-600">
                                  {t("dashboard.articles.previousPosition")}: {article.latestAnalysis.previous_average_position.toFixed(1)}位
                                </span>
                              )}
                              {article.latestAnalysis.position_change !== null && (
                                <span
                                  className={
                                    article.latestAnalysis.position_change > 0
                                      ? "text-red-600"
                                      : "text-green-600"
                                  }
                                >
                                  {article.latestAnalysis.position_change > 0 ? "+" : ""}
                                  {article.latestAnalysis.position_change.toFixed(1)}位
                                </span>
                              )}
                            </div>
                          )}
                          {article.last_analyzed_at && (
                            <p className="text-xs text-gray-400 mt-1">
                              {t("dashboard.articles.lastAnalyzed")}: {new Date(article.last_analyzed_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="ml-4 flex items-center gap-2">
                          {article.is_monitoring && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                              {t("dashboard.articles.monitoring")}
                            </span>
                          )}
                          <Link
                            href={`/${locale}/dashboard/articles/${article.id}`}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            {t("dashboard.articles.viewDetails")}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* サイドバー: 未読通知 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.notifications.title")}</h2>
              </div>
              <div className="divide-y">
                {data.unreadNotifications.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-500">
                    <p className="text-sm">{t("dashboard.notifications.noNotifications")}</p>
                  </div>
                ) : (
                  data.unreadNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="px-6 py-4 hover:bg-gray-50 cursor-pointer"
                    >
                      <h4 className="font-medium text-gray-900 mb-1 text-sm">
                        {notification.subject || t("dashboard.notifications.rankDropDetected")}
                      </h4>
                      {notification.article && (
                        <p className="text-xs text-gray-500 mb-2 truncate">
                          {notification.article.title || notification.article.url}
                        </p>
                      )}
                      {notification.summary && (
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {notification.summary}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notification.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </>
  );
}

