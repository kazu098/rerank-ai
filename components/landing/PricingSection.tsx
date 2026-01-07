"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Currency, getCurrencyFromLocale, formatPrice, isValidCurrency } from "@/lib/billing/currency";
import { Plan, getPlanPrice } from "@/lib/db/plans";
import { useLocale } from "next-intl";

export function PricingSection() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  // ロケールから直接通貨を判定（API呼び出しを待たずに即座に設定）
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => getCurrencyFromLocale(locale));
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [currencyDetected, setCurrencyDetected] = useState(false);

  // 初回マウント時に通貨を自動判定（URLロケールを優先）
  useEffect(() => {
    const detectCurrency = async () => {
      try {
        const response = await fetch(`/api/currency/detect?locale=${locale}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && isValidCurrency(data.currency)) {
            setSelectedCurrency(data.currency);
            setCurrencyDetected(true);
          }
        }
      } catch (error) {
        console.error("Failed to detect currency:", error);
      }
    };

    detectCurrency();
  }, [locale]);

  useEffect(() => {
    const fetchPlans = async () => {
      setLoadingPlans(true);
      try {
        const response = await fetch("/api/plans");
        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans || []);
        }
      } catch (error) {
        console.error("Failed to fetch plans:", error);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const handleCurrencyChange = (newCurrency: Currency) => {
    setSelectedCurrency(newCurrency);
    // 通貨はロケールから自動判定されるため、個別に保存する必要はありません
    // ユーザーが通貨を変更したい場合は、ロケール設定を変更してください
  };

  const handlePlanSelect = async (planName: string, e?: React.MouseEvent) => {
    // イベントの伝播を防ぐ
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 未ログイン時はログインに誘導
    if (status !== "authenticated") {
      router.push(`/${locale}?signin=true`);
      return;
    }
    
    const requestBody = {
      planName,
      currency: selectedCurrency,
      locale: locale,
    };

    setProcessingPlan(`${planName}-regular`);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || t("errors.checkoutFailed"));
        return;
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      alert(t("errors.checkoutFailed"));
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleTrialStart = async (planName: string, e?: React.MouseEvent) => {
    // イベントの伝播を防ぐ
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 未ログイン時はログインに誘導
    if (status !== "authenticated") {
      router.push(`/${locale}?signin=true`);
      return;
    }

    setProcessingPlan(`${planName}-trial`);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planName,
          currency: selectedCurrency,
          locale: locale,
          trial: true, // トライアルフラグ
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || t("errors.checkoutFailed"));
        return;
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Trial checkout error:", error);
      alert(t("errors.checkoutFailed"));
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <section id="pricing" className="py-20 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            {t("home.pricing.title")}
          </h2>
          <p className="text-gray-600 text-lg mb-4">
            {t("home.pricing.subtitle")}
          </p>
          {/* 通貨選択 */}
          <div className="flex items-center justify-center gap-4">
            <span className="text-gray-600">{t("home.pricing.currency")}:</span>
            <select
              value={selectedCurrency}
              onChange={(e) => {
                if (isValidCurrency(e.target.value)) {
                  handleCurrencyChange(e.target.value);
                }
              }}
              className="bg-white text-gray-900 px-4 py-2 rounded-lg border border-gray-300 shadow-sm"
            >
              <option value="USD">USD ($)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        {loadingPlans ? (
          <div className="text-center py-12">
            <div className="text-gray-600">{t("common.loading")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans
              .filter((plan) => plan.name !== "free")
              .map((plan) => {
                const isPopular = plan.name === "standard";

                return (
                  <div
                    key={plan.id}
                    className={`relative bg-white rounded-lg shadow-lg p-8 ${
                      isPopular ? "ring-2 ring-blue-500 scale-105" : ""
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                          {t("home.pricing.popular")}
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-8">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.display_name}</h3>
                      <div className="mb-4">
                        <span className="text-4xl font-bold text-gray-900">
                          {formatPrice(getPlanPrice(plan, selectedCurrency), selectedCurrency)}
                        </span>
                        <span className="text-gray-600">/月</span>
                      </div>
                    </div>

                    {/* 機能リスト */}
                    <ul className="space-y-4 mb-8">
                      <li className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">
                          {t("home.pricing.features.analyses")}: <strong>{plan.max_analyses_per_month === null ? t("billing.unlimited") : `${plan.max_analyses_per_month}${t("home.pricing.features.times")}`}</strong>
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">
                          {t("home.pricing.features.articles")}: <strong>{plan.max_articles === null ? t("billing.unlimited") : `${plan.max_articles}${t("home.pricing.features.articleUnit")}`}</strong>
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">
                          {t("home.pricing.features.suggestions")}: <strong>{plan.max_article_suggestions_per_month === null ? t("billing.unlimited") : `${plan.max_article_suggestions_per_month}${t("home.pricing.features.timesPerMonth")}`}</strong>
                        </span>
                      </li>
                    </ul>

                    {/* CTAボタン */}
                    <div className="mt-8">
                      {plan.name === "starter" ? (
                        <button
                          onClick={(e) => handleTrialStart(plan.name, e)}
                          disabled={processingPlan === `${plan.name}-trial` || processingPlan === `${plan.name}-regular` || loadingPlans}
                          className="block w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors text-center mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingPlan === `${plan.name}-trial` ? t("common.loading") : t("home.pricing.startTrial")}
                        </button>
                      ) : null}
                      <button
                        onClick={(e) => handlePlanSelect(plan.name, e)}
                        disabled={processingPlan === `${plan.name}-regular` || processingPlan === `${plan.name}-trial` || loadingPlans}
                        className="block w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingPlan === `${plan.name}-regular` ? t("common.loading") : t("home.pricing.getStarted")}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
}

