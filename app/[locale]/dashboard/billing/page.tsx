"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  max_articles: number | null;
  max_analyses_per_month: number | null;
  max_sites: number | null;
  max_concurrent_analyses: number;
  max_article_suggestions_per_month: number | null;
  analysis_history_days: number | null;
}

interface UserPlan {
  plan: Plan;
  plan_started_at: string | null;
  plan_ends_at: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface Usage {
  articles: number;
  analyses_this_month: number;
  sites: number;
  article_suggestions_this_month: number;
}

export default function BillingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("dashboard.billing");
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);

  useEffect(() => {
    if (session?.userId) {
      fetchBillingData();
    }
  }, [session]);

  const fetchBillingData = async () => {
    try {
      const [userResponse, usageResponse, plansResponse] = await Promise.all([
        fetch("/api/users/me"),
        fetch("/api/billing/usage"),
        fetch("/api/plans"),
      ]);

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUserPlan(userData.user);
      }

      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        setUsage(usageData.usage);
      }

      if (plansResponse.ok) {
        const plansData = await plansResponse.json();
        setAllPlans(plansData.plans || []);
      }
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!userPlan?.stripe_customer_id) {
      alert(t("stripeCustomerIdNotFound"));
      return;
    }

    try {
      const response = await fetch("/api/billing/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const error = await response.json();
        alert(error.message || t("customerPortalFailed"));
      }
    } catch (error) {
      console.error("Failed to get customer portal:", error);
      alert(t("customerPortalFailed"));
    }
  };

  const formatLimit = (limit: number | null): string => {
    if (limit === null) return t("unlimited");
    return limit.toString();
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
    }).format(price);
  };

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
      return "bg-blue-600"; // 0-69%：青（正常）
    }
  };

  const isTrialActive = (): boolean => {
    if (!userPlan?.trial_ends_at) return false;
    return new Date(userPlan.trial_ends_at) > new Date();
  };

  const tCommon = useTranslations("common");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">{tCommon("loading")}</div>
      </div>
    );
  }

  if (!userPlan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">{t("planLoadFailed")}</div>
      </div>
    );
  }

  const currentPlan = userPlan.plan;
  const isTrial = isTrialActive();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t("title")}</h1>

        {/* 現在のプラン */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("currentPlan")}</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-gray-900">{currentPlan.display_name}</div>
              <div className="text-gray-600 mt-1">
                {formatPrice(currentPlan.price_monthly)}/月
              </div>
              {isTrial && userPlan.trial_ends_at && (
                <div className="text-yellow-600 mt-2">
                  {t("trialUntil", { date: new Date(userPlan.trial_ends_at).toLocaleDateString(locale) })}
                </div>
              )}
              {userPlan.plan_ends_at && !isTrial && (
                <div className="text-gray-600 mt-2">
                  {t("nextRenewalDate", { date: new Date(userPlan.plan_ends_at).toLocaleDateString(locale) })}
                </div>
              )}
            </div>
            {userPlan.stripe_subscription_id && (
              <button
                onClick={handleManageSubscription}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {t("managePlan")}
              </button>
            )}
          </div>
        </div>

        {/* 使用状況 */}
        {usage && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("usage")}</h2>
            <div className="space-y-4">
              {/* 分析回数 */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700">{t("analyses")}</span>
                  <span className="text-gray-900 font-semibold">
                    {usage.analyses_this_month} / {formatLimit(currentPlan.max_analyses_per_month)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressBarColor(
                      getUsagePercentage(usage.analyses_this_month, currentPlan.max_analyses_per_month)
                    )}`}
                    style={{
                      width: `${getUsagePercentage(
                        usage.analyses_this_month,
                        currentPlan.max_analyses_per_month
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* 監視記事数 */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700">{t("articles")}</span>
                  <span className="text-gray-900 font-semibold">
                    {usage.articles} / {formatLimit(currentPlan.max_articles)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressBarColor(
                      getUsagePercentage(usage.articles, currentPlan.max_articles)
                    )}`}
                    style={{
                      width: `${getUsagePercentage(usage.articles, currentPlan.max_articles)}%`,
                    }}
                  />
                </div>
              </div>

              {/* 連携サイト数 */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700">{t("sites")}</span>
                  <span className="text-gray-900 font-semibold">
                    {usage.sites} / {formatLimit(currentPlan.max_sites)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressBarColor(
                      getUsagePercentage(usage.sites, currentPlan.max_sites)
                    )}`}
                    style={{
                      width: `${getUsagePercentage(usage.sites, currentPlan.max_sites)}%`,
                    }}
                  />
                </div>
              </div>

              {/* 新規記事提案 */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700">{t("articleSuggestions")}</span>
                  <span className="text-gray-900 font-semibold">
                    {usage.article_suggestions_this_month} /{" "}
                    {formatLimit(currentPlan.max_article_suggestions_per_month)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressBarColor(
                      getUsagePercentage(
                        usage.article_suggestions_this_month,
                        currentPlan.max_article_suggestions_per_month
                      )
                    )}`}
                    style={{
                      width: `${getUsagePercentage(
                        usage.article_suggestions_this_month,
                        currentPlan.max_article_suggestions_per_month
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* プラン変更 */}
        {allPlans.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("changePlan")}</h2>
            <div className="space-y-4">
              {allPlans
                .filter((plan) => plan.name !== "free" && plan.name !== currentPlan.name)
                .map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div>
                      <div className="font-semibold text-gray-900">{plan.display_name}</div>
                      <div className="text-gray-600 text-sm">
                        {formatPrice(plan.price_monthly)}/月
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        router.push("/#pricing");
                        // ページ遷移後にスクロール
                        setTimeout(() => {
                          const element = document.getElementById("pricing");
                          if (element) {
                            element.scrollIntoView({ behavior: "smooth" });
                          }
                        }, 100);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                      {t("changePlanButton")}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

