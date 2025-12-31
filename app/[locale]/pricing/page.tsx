"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Currency, getCurrencyFromLocale, formatPrice, isValidCurrency } from "@/lib/billing/currency";
import { Plan, getPlanPrice } from "@/lib/db/plans";

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("pricing");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => getCurrencyFromLocale(locale));

  useEffect(() => {
    fetchPlans();
    if (session?.userId) {
      fetchCurrentPlan();
    }
  }, [session]);

  const fetchPlans = async () => {
    try {
      const response = await fetch("/api/plans");
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error("Failed to fetch plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentPlan = async () => {
    try {
      const response = await fetch("/api/users/me");
      if (response.ok) {
        const data = await response.json();
        if (data.user?.plan) {
          setCurrentPlan(data.user.plan.name);
        }
      }
    } catch (error) {
      console.error("Failed to fetch current plan:", error);
    }
  };

  const handleStartTrial = async (planName: string) => {
    if (!session) {
      router.push(`/${locale}/auth/signin?redirect=/pricing`);
      return;
    }

    // トライアル開始APIを呼び出す
    try {
      const response = await fetch("/api/billing/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName }),
      });

      if (response.ok) {
        router.push(`/${locale}/dashboard`);
      } else {
        const error = await response.json();
        alert(error.message || "トライアルの開始に失敗しました");
      }
    } catch (error) {
      console.error("Failed to start trial:", error);
      alert("トライアルの開始に失敗しました");
    }
  };

  const handleSubscribe = async (planName: string) => {
    if (!session) {
      router.push(`/${locale}/auth/signin?redirect=/pricing`);
      return;
    }

    // チェックアウトセッションを作成（通貨は自動判定）
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName, currency: selectedCurrency }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const error = await response.json();
        alert(error.message || "サブスクリプションの開始に失敗しました");
      }
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      alert("サブスクリプションの開始に失敗しました");
    }
  };

  const formatLimit = (limit: number | null): string => {
    if (limit === null) return "無制限";
    return limit.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">読み込み中...</div>
      </div>
    );
  }

  // 無料プランを除外して表示
  const paidPlans = plans.filter((plan) => plan.name !== "free");

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* ヘッダー */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">料金プラン</h1>
          <p className="text-gray-400 text-lg mb-4">
            あなたのニーズに合わせたプランを選択してください
          </p>
          {/* 通貨選択 */}
          <div className="flex items-center justify-center gap-4">
            <span className="text-gray-400">通貨:</span>
            <select
              value={selectedCurrency}
              onChange={(e) => {
                if (isValidCurrency(e.target.value)) {
                  setSelectedCurrency(e.target.value);
                }
              }}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700"
            >
              <option value="USD">USD ($)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        {/* プラン比較表 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {paidPlans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.name;
            const isPopular = plan.name === "standard";

            return (
              <div
                key={plan.id}
                className={`relative bg-gray-800 rounded-lg p-8 ${
                  isPopular ? "ring-2 ring-blue-500 scale-105" : ""
                }`}
              >
                {isPopular && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      人気
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2">{plan.display_name}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold">
                      {formatPrice(getPlanPrice(plan, selectedCurrency), selectedCurrency)}
                    </span>
                    <span className="text-gray-400">/月</span>
                  </div>
                </div>

                {/* 機能リスト */}
                <ul className="space-y-4 mb-8">
                  <li className="flex items-start">
                    <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      月間分析回数: <strong>{formatLimit(plan.max_analyses_per_month)}回</strong>
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      監視記事数: <strong>{formatLimit(plan.max_articles)}記事</strong>
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      GSC連携: <strong>{formatLimit(plan.max_sites)}サイト</strong>
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      新規記事提案: <strong>{formatLimit(plan.max_article_suggestions_per_month)}回/月</strong>
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      分析履歴: <strong>
                        {plan.analysis_history_days === null
                          ? "無制限"
                          : `${plan.analysis_history_days}日間`}
                      </strong>
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      同時実行数: <strong>{plan.max_concurrent_analyses}件</strong>
                    </span>
                  </li>
                  {plan.name === "business" && (
                    <>
                      <li className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span>API連携</span>
                      </li>
                      <li className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span>優先サポート</span>
                      </li>
                    </>
                  )}
                </ul>

                {/* CTAボタン */}
                <div className="mt-8">
                  {isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full bg-gray-700 text-gray-400 py-3 rounded-lg font-semibold cursor-not-allowed"
                    >
                      現在のプラン
                    </button>
                  ) : (
                    <>
                      {plan.name === "starter" && (
                        <button
                          onClick={() => handleStartTrial(plan.name)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors mb-2"
                        >
                          7日間無料トライアル
                        </button>
                      )}
                      <button
                        onClick={() => handleSubscribe(plan.name)}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
                      >
                        今すぐ始める
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQセクション */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-8 text-center">よくある質問</h2>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="font-semibold mb-2">無料トライアルはありますか？</h3>
              <p className="text-gray-400">
                スタータープランは7日間の無料トライアルをご利用いただけます。クレジットカードの登録は不要です。
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="font-semibold mb-2">プランの変更は可能ですか？</h3>
              <p className="text-gray-400">
                いつでもプランを変更できます。変更は即座に反映され、比例配分で請求されます。
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="font-semibold mb-2">解約はいつでも可能ですか？</h3>
              <p className="text-gray-400">
                はい、いつでも解約できます。解約後も現在の請求期間の終了日までサービスをご利用いただけます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

