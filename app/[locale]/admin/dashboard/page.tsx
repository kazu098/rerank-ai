"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface DashboardStats {
  users: {
    total: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    newLastMonth: number;
    growthRate: number | null;
    byProvider: {
      google: number;
      credentials: number;
    };
  };
  plans: {
    byPlan: Record<string, number>;
  };
  articles: {
    total: number;
    monitoring: number;
  };
  analyses: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growthRate: number | null;
  };
  articleSuggestions: {
    total: number;
    thisMonth: number;
  };
  sites: {
    total: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    byPlan: Record<string, number>;
  };
}

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/dashboard/stats");

      if (!response.ok) {
        throw new Error("統計データの取得に失敗しました");
      }

      const data = await response.json();
      setStats(data.stats);
    } catch (err: any) {
      console.error("[Admin Dashboard] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("ja-JP").format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
    }).format(num);
  };

  const formatGrowthRate = (rate: number | null) => {
    if (rate === null) return "-";
    const sign = rate >= 0 ? "+" : "";
    return `${sign}${(rate * 100).toFixed(1)}%`;
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

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-600 mt-2">サービスの運営状況を確認</p>
      </div>

      {/* ユーザー統計 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">ユーザー統計</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">総ユーザー数</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {formatNumber(stats.users.total)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今日の新規登録</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {formatNumber(stats.users.newToday)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今週の新規登録</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatNumber(stats.users.newThisWeek)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今月の新規登録</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">
              {formatNumber(stats.users.newThisMonth)}
            </p>
            {stats.users.growthRate !== null && (
              <p className="text-sm mt-1 text-gray-600">
                前月比: {formatGrowthRate(stats.users.growthRate)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-gray-500 mb-2">認証方法別の内訳</p>
          <div className="flex gap-4">
            <span className="text-sm">
              Google: {formatNumber(stats.users.byProvider.google)}
            </span>
            <span className="text-sm">
              メール・パスワード: {formatNumber(stats.users.byProvider.credentials)}
            </span>
          </div>
        </div>
      </div>

      {/* プラン別ユーザー数 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">プラン別ユーザー数</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(stats.plans.byPlan).map(([planName, count]) => (
            <div key={planName} className="border rounded-lg p-4">
              <p className="text-sm text-gray-500 capitalize">{planName}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatNumber(count)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 収益統計 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">収益統計</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">MRR (月間経常収益)</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatCurrency(stats.revenue.mrr)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">ARR (年間経常収益)</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {formatCurrency(stats.revenue.arr)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">プラン別MRR</p>
            <div className="mt-2 space-y-1">
              {Object.entries(stats.revenue.byPlan).map(([planName, mrr]) => (
                <div key={planName} className="flex justify-between text-sm">
                  <span className="capitalize">{planName}:</span>
                  <span className="font-semibold">{formatCurrency(mrr)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 記事・分析統計 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">記事統計</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">総記事数</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(stats.articles.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">監視中記事数</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {formatNumber(stats.articles.monitoring)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">分析実行統計</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">総分析実行回数</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(stats.analyses.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">今月の分析実行回数</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {formatNumber(stats.analyses.thisMonth)}
              </p>
              {stats.analyses.growthRate !== null && (
                <p className="text-sm mt-1 text-gray-600">
                  前月比: {formatGrowthRate(stats.analyses.growthRate)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* その他の統計 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">新規記事提案</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">総提案回数</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(stats.articleSuggestions.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">今月の提案回数</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {formatNumber(stats.articleSuggestions.thisMonth)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">GSC連携</h2>
          <div>
            <p className="text-sm text-gray-500">連携サイト数</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatNumber(stats.sites.total)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
