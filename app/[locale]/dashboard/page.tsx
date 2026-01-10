"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";

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

interface UserPlan {
  plan: {
    name: string;
    display_name: string;
    price_monthly: number;
    max_articles: number | null;
    max_analyses_per_month: number | null;
    max_sites: number | null;
  } | null;
  plan_ends_at: string | null;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
}

interface Usage {
  articles: number;
  analyses_this_month: number;
  article_suggestions_this_month: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated" && session?.userId) {
      fetchDashboardData();
      // 再認証後に既存サイトのリフレッシュトークンを更新
      updateSiteTokens();
    }
  }, [status, session, router]);

  const updateSiteTokens = async () => {
    try {
      const response = await fetch("/api/sites/update-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.updatedSites && result.updatedSites.length > 0) {
          console.log(`[Dashboard] Updated refresh tokens for ${result.updatedSites.length} site(s)`);
        }
      } else {
        const error = await response.json();
        // リフレッシュトークンが取得できない場合はエラーを無視（既に有効なトークンがある場合など）
        if (error.code !== "NO_REFRESH_TOKEN") {
          console.error("[Dashboard] Failed to update site tokens:", error);
        }
      }
    } catch (err: any) {
      // エラーは無視（サイト更新は必須ではない）
      console.error("[Dashboard] Error updating site tokens:", err);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardResponse, userResponse, usageResponse] = await Promise.all([
        fetch("/api/dashboard/data"),
        fetch("/api/users/me"),
        fetch("/api/billing/usage"),
      ]);
      
      if (!dashboardResponse.ok) {
        throw new Error("ダッシュボードデータの取得に失敗しました");
      }

      const dashboardData = await dashboardResponse.json();
      setData(dashboardData);

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUserPlan(userData.user);
      }

      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        setUsage(usageData.usage);
      }
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

  const getUsagePercentage = (current: number, limit: number | null): number => {
    if (limit === null) return 0;
    return Math.min((current / limit) * 100, 100);
  };

  const getProgressBarColor = (percentage: number): string => {
    if (percentage >= 100) {
      return "bg-red-400"; // 100%に達した場合：柔らかい赤
    } else if (percentage >= 90) {
      return "bg-orange-500"; // 90-99%：オレンジ（警告）
    } else if (percentage >= 70) {
      return "bg-yellow-500"; // 70-89%：黄色（注意）
    } else {
      return "bg-blue-500"; // 0-69%：青（正常）
    }
  };

  const isTrialActive = (): boolean => {
    if (!userPlan?.trial_ends_at) return false;
    return new Date(userPlan.trial_ends_at) > new Date();
  };

  const formatLimit = (limit: number | null): string => {
    if (limit === null) return t("billing.unlimited");
    return limit.toString();
  };

  return (
    <>
        {/* プラン情報と使用状況 */}
        {userPlan?.plan && usage && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.billing.currentPlan")}</h2>
              <Link
                href="/dashboard/billing?tab=overview"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {t("dashboard.billing.viewDetails")} →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* プラン情報 */}
              <div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {userPlan.plan.display_name}
                </div>
                {/* フリープランにはトライアル期間は設定されない（分析回数などの制限のみで制御） */}
                {userPlan.plan_ends_at && userPlan.plan?.name !== "free" && userPlan.stripe_subscription_id && (
                  <div className="text-sm text-gray-600 mt-1">
                    {t("dashboard.billing.nextRenewalDate", {
                      date: new Date(userPlan.plan_ends_at).toLocaleDateString(locale)
                    })}
                  </div>
                )}
              </div>

              {/* 使用状況サマリー */}
              <div className="space-y-3">
                {/* 分析回数 */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">
                      {userPlan.plan.name === "free" ? t("dashboard.billing.analysesTotal") : t("dashboard.billing.analyses")}
                    </span>
                    <span className="font-semibold">
                      {usage.analyses_this_month} / {formatLimit(userPlan.plan.max_analyses_per_month)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressBarColor(
                      getUsagePercentage(usage.analyses_this_month, userPlan.plan.max_analyses_per_month)
                    )}`}
                    style={{
                      width: `${getUsagePercentage(usage.analyses_this_month, userPlan.plan.max_analyses_per_month)}%`,
                    }}
                  />
                  </div>
                </div>

                {/* 監視記事数 */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{t("dashboard.billing.articles")}</span>
                    <span className="font-semibold">
                      {usage.articles} / {formatLimit(userPlan.plan.max_articles)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressBarColor(
                      getUsagePercentage(usage.articles, userPlan.plan.max_articles)
                    )}`}
                    style={{
                      width: `${getUsagePercentage(usage.articles, userPlan.plan.max_articles)}%`,
                    }}
                  />
                  </div>
                </div>
              </div>
            </div>

            {/* 制限に近づいている場合の警告 */}
            {(getUsagePercentage(usage.analyses_this_month, userPlan.plan.max_analyses_per_month) >= 90 ||
              getUsagePercentage(usage.articles, userPlan.plan.max_articles) >= 90) && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-yellow-800">
                    {t("dashboard.billing.limitWarning")}
                  </p>
                  <a
                    href="/#pricing"
                    className="text-sm font-semibold text-yellow-800 hover:text-yellow-900"
                  >
                    {t("billing.upgradePlan")} →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

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
                            href={`/dashboard/articles/${article.id}`}
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
                    <Link
                      key={notification.id}
                      href={`/dashboard/articles/${notification.article_id}`}
                      className="block px-6 py-4 hover:bg-gray-50 cursor-pointer"
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
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </>
  );
}

