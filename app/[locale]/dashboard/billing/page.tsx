"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Currency, getCurrencyFromLocale, formatPrice as formatCurrencyPrice, isValidCurrency } from "@/lib/billing/currency";

interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  prices: Record<string, number> | null; // 各通貨ごとの価格
  max_articles: number | null;
  max_analyses_per_month: number | null;
  max_sites: number | null;
  max_concurrent_analyses: number;
  max_article_suggestions_per_month: number | null;
  analysis_history_days: number | null;
}

interface UserPlan {
  plan: Plan;
  pending_plan: Plan | null; // 次回適用されるプラン（ダウングレード時など）
  plan_started_at: string | null;
  plan_ends_at: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface Usage {
  articles: number;
  analyses_this_month: number;
  article_suggestions_this_month: number;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  periodStart: number;
  periodEnd: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  description: string;
}

export default function BillingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("dashboard.billing");
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => getCurrencyFromLocale(locale));
  const [currencyDetected, setCurrencyDetected] = useState(false);
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "invoices">("overview");

  useEffect(() => {
    if (session?.userId) {
      fetchBillingData();
    }
  }, [session]);

  // チェックアウト完了後のセッション検証
  useEffect(() => {
    const verifyCheckoutSession = async () => {
      const success = searchParams?.get('success');
      const sessionId = searchParams?.get('session_id');

      if (success === 'true' && sessionId && session?.userId) {
        setVerifyingSession(true);
        try {
          const response = await fetch('/api/billing/verify-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId }),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('[Billing Page] Session verified, plan updated:', data);
            // URLからクエリパラメータを削除
            router.replace(`/${locale}/dashboard/billing`);
            // プランデータを再取得
            await fetchBillingData();
          } else {
            const error = await response.json();
            console.error('[Billing Page] Failed to verify session:', error);
          }
        } catch (error) {
          console.error('[Billing Page] Error verifying session:', error);
        } finally {
          setVerifyingSession(false);
        }
      }
    };

    verifyCheckoutSession();
  }, [searchParams, session, locale, router]);

  // 初回マウント時に通貨を自動判定
  useEffect(() => {
    const detectCurrency = async () => {
      try {
        const response = await fetch("/api/currency/detect");
        if (response.ok) {
          const data = await response.json();
          if (data.success && isValidCurrency(data.currency)) {
            setSelectedCurrency(data.currency);
            setCurrencyDetected(true);
          }
        }
      } catch (error) {
        console.error("Failed to detect currency:", error);
        // エラー時はロケールベースの判定を使用（既に設定済み）
      }
    };

    detectCurrency();
  }, []); // 初回のみ実行

  const fetchBillingData = async () => {
    try {
      const [userResponse, usageResponse, plansResponse, invoicesResponse] = await Promise.all([
        fetch("/api/users/me"),
        fetch("/api/billing/usage"),
        fetch("/api/plans"),
        fetch("/api/billing/invoices"),
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

      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        setInvoices(invoicesData.invoices || []);
      }
    } catch (error) {
      console.error("Failed to fetch billing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm(t("confirmCancelSubscription"))) {
      return;
    }

    setChangingPlan("free");
    try {
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        alert(t("subscriptionCancelled"));
        // データを再取得
        await fetchBillingData();
      } else {
        const error = await response.json();
        alert(error.error || t("cancelSubscriptionFailed"));
      }
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
      alert(t("cancelSubscriptionFailed"));
    } finally {
      setChangingPlan(null);
    }
  };

  const handleChangePlan = async (planName: string) => {
    setChangingPlan(planName);
    try {
      const response = await fetch("/api/billing/subscription/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planName,
          currency: selectedCurrency, // 選択された通貨を渡す
          // prorationBehaviorは省略（API側で自動判定: アップグレード=即時、ダウングレード=期間終了時）
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || t("planChangeFailed"));
        return;
      }

      const data = await response.json();
      if (data.success) {
        // チェックアウトが必要な場合（フリープランから有料プランに変更）
        if (data.requiresCheckout && data.url) {
          window.open(data.url, '_blank');
          // チェックアウトは新しいタブで開くので、ここでは処理を終了
          // ユーザーがチェックアウトを完了すると、Webhookでプランが更新される
          setChangingPlan(null);
          return;
        }
        alert(t("planChangeSuccess"));
        // データを再取得
        await fetchBillingData();
      }
    } catch (error: any) {
      console.error("Failed to change plan:", error);
      alert(t("planChangeFailed"));
    } finally {
      setChangingPlan(null);
    }
  };

  const formatLimit = (limit: number | null): string => {
    if (limit === null) return t("unlimited");
    return limit.toString();
  };

  // プランの価格を取得（通貨対応）
  const getPlanPriceWithCurrency = (plan: Plan, currency: Currency): number => {
    if (!plan.prices) {
      // pricesが設定されていない場合は、price_monthlyを使用（後方互換性）
      return plan.price_monthly;
    }
    const price = plan.prices[currency];
    if (price === undefined || price === null) {
      // 通貨が存在しない場合は、price_monthlyを使用
      return plan.price_monthly;
    }
    return price;
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

        {/* タブ */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t("tabPlan")}
            </button>
            {invoices.length > 0 && (
              <button
                onClick={() => setActiveTab("invoices")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors relative ${
                  activeTab === "invoices"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {t("tabInvoiceHistory")}
                {invoices.length > 0 && (
                  <span className="ml-2 py-0.5 px-2 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                    {invoices.length}
                  </span>
                )}
              </button>
            )}
          </nav>
        </div>

        {/* タブコンテンツ */}
        {activeTab === "overview" && (
          <>

        {/* 現在のプラン */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("currentPlan")}</h2>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-2xl font-bold text-gray-900">{currentPlan.display_name}</div>
              <div className="text-gray-600 mt-1">
                {formatCurrencyPrice(getPlanPriceWithCurrency(currentPlan, selectedCurrency), selectedCurrency)}/月
              </div>
              {/* フリープランにはトライアル期間は設定されない（分析回数などの制限のみで制御） */}
              {userPlan.plan_ends_at && currentPlan.name !== "free" && userPlan.stripe_subscription_id && (
                <div className="text-gray-600 mt-2">
                  {t("nextRenewalDate", { date: new Date(userPlan.plan_ends_at).toLocaleDateString(locale) })}
                </div>
              )}
              {/* pending_planがある場合（ダウングレード時） */}
              {userPlan.pending_plan && userPlan.pending_plan.id !== currentPlan.id && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm text-blue-800 font-semibold mb-1">
                    {t("planChangeScheduled") || "プラン変更予定"}
                  </div>
                  <div className="text-sm text-blue-700">
                    {t("nextPlanFrom", { 
                      planName: userPlan.pending_plan.display_name,
                      date: userPlan.plan_ends_at 
                        ? new Date(userPlan.plan_ends_at).toLocaleDateString(locale)
                        : ""
                    }) || `次回から: ${userPlan.pending_plan.display_name}プラン（${userPlan.plan_ends_at ? new Date(userPlan.plan_ends_at).toLocaleDateString(locale) : ""}から）`}
                  </div>
                </div>
              )}
            </div>
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

              {/* 新規記事提案 */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-700">{t("articleSuggestionsCount")}</span>
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
                .filter((plan) => plan.name !== "free")
                .map((plan) => {
                  const isCurrentPlan = plan.name === currentPlan.name;
                  return (
                    <div
                      key={plan.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        isCurrentPlan
                          ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div>
                            <div className="font-semibold text-gray-900">{plan.display_name}</div>
                            <div className="text-gray-600 text-sm">
                              {formatCurrencyPrice(getPlanPriceWithCurrency(plan, selectedCurrency), selectedCurrency)}/月
                            </div>
                          </div>
                          {isCurrentPlan && (
                            <span className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-full">
                              {t("currentPlan")}
                            </span>
                          )}
                        </div>
                        {/* 機能リスト */}
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">•</span>
                            <span>{t("analyses")}: {formatLimit(plan.max_analyses_per_month)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">•</span>
                            <span>{t("articles")}: {formatLimit(plan.max_articles)}</span>
                          </div>
                          {plan.max_article_suggestions_per_month !== null && (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">•</span>
                              <span>
                                {t("articleSuggestionsCount")}: {formatLimit(plan.max_article_suggestions_per_month)}
                                {plan.max_article_suggestions_per_month !== null && plan.max_article_suggestions_per_month > 0 && (
                                  <span className="text-gray-500"> ({t("articleSuggestionsPerTime")})</span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                        {/* プラン変更の注釈 */}
                        {!isCurrentPlan && currentPlan.name !== "free" && (() => {
                          const planPrice = getPlanPriceWithCurrency(plan, selectedCurrency);
                          const currentPlanPrice = getPlanPriceWithCurrency(currentPlan, selectedCurrency);
                          if (!planPrice || !currentPlanPrice) return null;
                          
                          return (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              {planPrice > currentPlanPrice ? (
                                <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                                  {t("planChangeUpgradeNote")}
                                </div>
                              ) : planPrice < currentPlanPrice ? (
                                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                  {t("planChangeDowngradeNote")}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isCurrentPlan && (
                          <button
                            onClick={() => handleChangePlan(plan.name)}
                            disabled={changingPlan === plan.name}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {changingPlan === plan.name ? t("changing") : t("changePlanButton")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              
              {/* フリープランに戻る */}
              {currentPlan.name !== "free" && userPlan?.stripe_subscription_id && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <div className="font-semibold text-gray-900">{t("backToFreePlan")}</div>
                      <div className="text-gray-600 text-sm mt-1">
                        {t("backToFreePlanDescription")}
                      </div>
                    </div>
                    <button
                      onClick={handleCancelSubscription}
                      disabled={changingPlan === "free"}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {changingPlan === "free" ? t("cancelling") : t("backToFreePlanButton")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}

        {/* 請求履歴タブ */}
        {activeTab === "invoices" && invoices.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("invoiceHistory")}</h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-gray-900">
                        {(() => {
                          const invoiceCurrency = invoice.currency.toUpperCase() as Currency;
                          if (isValidCurrency(invoiceCurrency)) {
                            return formatCurrencyPrice(invoice.amount, invoiceCurrency);
                          }
                          // 無効な通貨の場合はフォールバック
                          return `${invoice.amount / 100} ${invoice.currency.toUpperCase()}`;
                        })()}
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          invoice.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : invoice.status === "open"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {invoice.status === "paid"
                          ? t("invoiceStatus.paid")
                          : invoice.status === "open"
                          ? t("invoiceStatus.open")
                          : t("invoiceStatus.void")}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {new Date(invoice.created * 1000).toLocaleDateString(locale, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    {invoice.description && (
                      <div className="text-xs text-gray-500 mt-1">{invoice.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {invoice.hostedInvoiceUrl && (
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-sm font-semibold"
                      >
                        {t("viewInvoice")}
                      </a>
                    )}
                    {invoice.invoicePdf && (
                      <a
                        href={invoice.invoicePdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-gray-700 text-sm"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

