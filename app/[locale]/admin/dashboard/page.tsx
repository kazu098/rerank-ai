"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface DashboardStats {
  users: {
    total: number;
    active: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    newLastMonth: number;
    growthRate: number | null;
    byProvider: {
      google: number;
      credentials: number;
    };
    recent: Array<{
      id: string;
      email: string;
      name: string | null;
      created_at: string;
      provider: string | null;
      planName: string;
    }>;
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
    recent: Array<{
      id: string;
      created_at: string;
      article: {
        id: string;
        url: string;
        title: string | null;
        user_id: string;
      };
    }>;
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
  subscriptions: {
    active: number;
    cancellationsThisMonth: number;
    cancellationsLastMonth: number;
    churnRate: number | null;
    trialUsers: number;
  };
  notifications: {
    total: number;
    thisMonth: number;
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

  const formatDate = (dateString: string) => {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">総ユーザー数</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {formatNumber(stats.users.total)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">アクティブユーザー</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {formatNumber(stats.users.active)}
            </p>
            <p className="text-xs text-gray-500 mt-1">過去30日以内</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今日の新規登録</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatNumber(stats.users.newToday)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今週の新規登録</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">
              {formatNumber(stats.users.newThisWeek)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今月の新規登録</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">
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

      {/* サブスクリプション統計 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">サブスクリプション統計</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">アクティブサブスクリプション</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatNumber(stats.subscriptions.active)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">今月の解約数</p>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {formatNumber(stats.subscriptions.cancellationsThisMonth)}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">解約率</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">
              {stats.subscriptions.churnRate !== null
                ? `${(stats.subscriptions.churnRate * 100).toFixed(2)}%`
                : "-"}
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">トライアル中ユーザー</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {formatNumber(stats.subscriptions.trialUsers)}
            </p>
          </div>
        </div>
      </div>

      {/* その他の統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">通知送信</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">総送信数</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(stats.notifications.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">今月の送信数</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">
                {formatNumber(stats.notifications.thisMonth)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 最近のユーザー一覧 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">最近のユーザー（新規登録順）</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  メールアドレス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名前
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  認証方法
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  プラン
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  登録日時
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.users.recent.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.provider === "google" ? "Google" : "メール・パスワード"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {user.planName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(user.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 最近の分析実行履歴 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">最近の分析実行履歴</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  実行日時
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  記事URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  タイトル
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.analyses.recent.map((analysis) => (
                <tr key={analysis.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(analysis.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <a
                      href={analysis.article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 truncate block max-w-md"
                    >
                      {analysis.article.url}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {analysis.article.title || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
