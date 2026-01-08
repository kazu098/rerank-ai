"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, Link } from "@/src/i18n/routing";

interface UserDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    provider: string | null;
    created_at: string;
    plan: {
      id: string;
      name: string;
      display_name: string;
    } | null;
    plan_started_at: string | null;
    plan_ends_at: string | null;
    trial_ends_at: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    locale: string | null;
    timezone: string | null;
  };
  usage: {
    articles: {
      total: number;
      monitoring: number;
    };
    analyses: {
      total: number;
      thisMonth: number;
    };
    articleSuggestions: {
      thisMonth: number;
    };
    sites: number;
  };
}

export default function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Array<{
    id: string;
    name: string;
    display_name: string;
  }>>([]);

  useEffect(() => {
    fetchUserDetail();
    fetchPlans();
  }, [params.id]);

  const fetchUserDetail = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/users/${params.id}`);

      if (!response.ok) {
        throw new Error("ユーザー詳細情報の取得に失敗しました");
      }

      const data = await response.json();
      setUserDetail(data);
    } catch (err: any) {
      console.error("[Admin User Detail] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await fetch("/api/plans");
      if (response.ok) {
        const data = await response.json();
        setAvailablePlans(data.plans || []);
      }
    } catch (err) {
      console.error("[Admin User Detail] Error fetching plans:", err);
    }
  };

  const handleChangePlan = async (planName: string) => {
    if (!confirm(`このユーザーのプランを「${planName}」に変更しますか？`)) {
      return;
    }

    setChangingPlan(planName);
    try {
      const response = await fetch(`/api/admin/users/${params.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "プランの変更に失敗しました");
      }

      alert("プランを変更しました");
      await fetchUserDetail();
    } catch (err: any) {
      console.error("[Admin User Detail] Error changing plan:", err);
      alert(err.message || "プランの変更に失敗しました");
    } finally {
      setChangingPlan(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!userDetail) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/dashboard"
            className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-block"
          >
            ← ダッシュボードに戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">ユーザー詳細</h1>
        </div>
      </div>

      {/* ユーザー基本情報 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">基本情報</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">メールアドレス</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {userDetail.user.email}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">名前</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {userDetail.user.name || "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">認証方法</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {userDetail.user.provider === "google" ? "Google" : "メール・パスワード"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">登録日時</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {formatDate(userDetail.user.created_at)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">ロケール</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {userDetail.user.locale || "ja"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">タイムゾーン</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {userDetail.user.timezone || "UTC"}
            </p>
          </div>
        </div>
      </div>

      {/* プラン情報 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">プラン情報</h2>
          {availablePlans.length > 0 && (
            <div className="flex gap-2">
              {availablePlans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => handleChangePlan(plan.name)}
                  disabled={
                    changingPlan === plan.name ||
                    userDetail.user.plan?.name === plan.name
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    userDetail.user.plan?.name === plan.name
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {changingPlan === plan.name ? "変更中..." : plan.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">現在のプラン</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {userDetail.user.plan?.display_name || "未設定"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">プラン開始日</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {formatDate(userDetail.user.plan_started_at)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">プラン終了日</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {formatDate(userDetail.user.plan_ends_at)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">トライアル終了日</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {formatDate(userDetail.user.trial_ends_at)}
            </p>
          </div>
          {userDetail.user.stripe_customer_id && (
            <div>
              <p className="text-sm text-gray-500">Stripe Customer ID</p>
              <p className="text-sm font-mono text-gray-900 mt-1">
                {userDetail.user.stripe_customer_id}
              </p>
            </div>
          )}
          {userDetail.user.stripe_subscription_id && (
            <div>
              <p className="text-sm text-gray-500">Stripe Subscription ID</p>
              <p className="text-sm font-mono text-gray-900 mt-1">
                {userDetail.user.stripe_subscription_id}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 利用状況 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">利用状況</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">総記事数</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {userDetail.usage.articles.total}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">監視中記事数</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {userDetail.usage.articles.monitoring}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">総分析実行回数</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {userDetail.usage.analyses.total}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今月の分析実行回数</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {userDetail.usage.analyses.thisMonth}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今月の記事提案回数</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">
              {userDetail.usage.articleSuggestions.thisMonth}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">GSC連携サイト数</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">
              {userDetail.usage.sites}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
