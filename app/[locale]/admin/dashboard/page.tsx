"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Link } from "@/src/i18n/routing";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

interface TrendData {
  period: string;
  trends: {
    users: Array<{ date: string; count: number }>;
    analyses: Array<{ date: string; count: number }>;
    mrr?: Array<{ date: string; mrr: number }>;
  };
}

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ユーザー一覧のページング
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize] = useState(20);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersList, setUsersList] = useState<Array<{
    id: string;
    email: string;
    name: string | null;
    created_at: string;
    provider: string | null;
    planName: string;
  }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // 分析実行履歴のページング
  const [analysesPage, setAnalysesPage] = useState(1);
  const [analysesPageSize] = useState(20);
  const [analysesTotalPages, setAnalysesTotalPages] = useState(1);
  const [analysesList, setAnalysesList] = useState<Array<{
    id: string;
    created_at: string;
    article: {
      id: string;
      url: string;
      title: string | null;
      user_id: string;
    };
  }>>([]);
  const [analysesLoading, setAnalysesLoading] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchTrends();
    fetchUsers();
    fetchAnalyses();
  }, []);

  useEffect(() => {
    fetchTrends();
  }, [trendPeriod]);

  useEffect(() => {
    fetchUsers();
  }, [usersPage]);

  useEffect(() => {
    fetchAnalyses();
  }, [analysesPage]);

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

  const fetchTrends = async () => {
    try {
      const response = await fetch(`/api/admin/dashboard/trends?period=${trendPeriod}`);

      if (!response.ok) {
        throw new Error("時系列データの取得に失敗しました");
      }

      const data = await response.json();
      setTrends(data);
    } catch (err: any) {
      console.error("[Admin Dashboard Trends] Error:", err);
      // エラーは表示しない（グラフが表示されないだけ）
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await fetch(
        `/api/admin/users?page=${usersPage}&pageSize=${usersPageSize}`
      );

      if (!response.ok) {
        throw new Error("ユーザー一覧の取得に失敗しました");
      }

      const data = await response.json();
      setUsersList(data.users || []);
      setUsersTotalPages(data.totalPages || 1);
    } catch (err: any) {
      console.error("[Admin Dashboard Users] Error:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchAnalyses = async () => {
    try {
      setAnalysesLoading(true);
      const response = await fetch(
        `/api/admin/analyses?page=${analysesPage}&pageSize=${analysesPageSize}`
      );

      if (!response.ok) {
        throw new Error("分析実行履歴の取得に失敗しました");
      }

      const data = await response.json();
      setAnalysesList(data.analyses || []);
      setAnalysesTotalPages(data.totalPages || 1);
    } catch (err: any) {
      console.error("[Admin Dashboard Analyses] Error:", err);
    } finally {
      setAnalysesLoading(false);
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-600 mt-2">サービスの運営状況を確認</p>
      </div>

      {/* ========== ユーザー関連 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">ユーザー関連</h2>
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
      </div>

      {/* ========== 収益関連 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">収益関連</h2>
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

      </div>

      {/* ========== 記事・コンテンツ関連 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">記事・コンテンツ関連</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

      {/* ========== 分析関連 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">分析関連</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">分析実行統計</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">総分析実行回数</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatNumber(stats.analyses.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">今月の分析実行回数</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
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

      {/* ========== その他 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">その他</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">通知送信</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">総送信数</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatNumber(stats.notifications.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">今月の送信数</p>
              <p className="text-3xl font-bold text-indigo-600 mt-2">
                {formatNumber(stats.notifications.thisMonth)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========== 時系列グラフ ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">時系列グラフ</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">時系列グラフ</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTrendPeriod("daily")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                trendPeriod === "daily"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              日次
            </button>
            <button
              onClick={() => setTrendPeriod("weekly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                trendPeriod === "weekly"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              週次
            </button>
            <button
              onClick={() => setTrendPeriod("monthly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                trendPeriod === "monthly"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              月次
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* ユーザー登録数の推移 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ユーザー登録数の推移
            </h3>
            {trends && trends.trends.users.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trends.trends.users}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12 }}
                    label={{ value: "新規登録数", angle: -90, position: "insideLeft" }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    label={{ value: "累計ユーザー数", angle: 90, position: "insideRight" }}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="新規登録数"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="累計ユーザー数"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                データがありません
              </div>
            )}
          </div>

          {/* 分析実行数の推移 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              分析実行数の推移
            </h3>
            {trends && trends.trends.analyses.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trends.trends.analyses}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#10b981" name="実行数" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                データがありません
              </div>
            )}
          </div>
        </div>

        {/* MRRの推移 */}
        {trends?.trends.mrr && trends.trends.mrr.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              MRR（月間経常収益）の推移
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends.trends.mrr}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `¥${(value / 1000).toFixed(0)}k`}
                  label={{ value: "新規MRR", angle: -90, position: "insideLeft" }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `¥${(value / 1000).toFixed(0)}k`}
                  label={{ value: "累計MRR", angle: 90, position: "insideRight" }}
                />
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined) => [
                    value !== undefined ? formatCurrency(value) : "-",
                    name === "mrr" ? "新規MRR" : "累計MRR",
                  ]}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="mrr"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="新規MRR"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="累計MRR"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        </div>
      </div>

      {/* ========== ユーザー一覧 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">ユーザー一覧</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">ユーザー一覧（新規登録順）</h2>
        {usersLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-600">読み込み中...</div>
          </div>
        ) : (
          <>
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
                  {usersList.length > 0 ? (
                    usersList.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {user.email}
                          </Link>
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                        ユーザーがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* ページネーション */}
            {usersTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  ページ {usersPage} / {usersTotalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUsersPage(Math.max(1, usersPage - 1))}
                    disabled={usersPage === 1}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    前へ
                  </button>
                  <button
                    onClick={() => setUsersPage(Math.min(usersTotalPages, usersPage + 1))}
                    disabled={usersPage === usersTotalPages}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* ========== 分析実行履歴 ========== */}
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-900">分析実行履歴</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">分析実行履歴</h2>
        {analysesLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-600">読み込み中...</div>
          </div>
        ) : (
          <>
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
                  {analysesList.length > 0 ? (
                    analysesList.map((analysis) => (
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                        分析実行履歴がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* ページネーション */}
            {analysesTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  ページ {analysesPage} / {analysesTotalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAnalysesPage(Math.max(1, analysesPage - 1))}
                    disabled={analysesPage === 1}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    前へ
                  </button>
                  <button
                    onClick={() => setAnalysesPage(Math.min(analysesTotalPages, analysesPage + 1))}
                    disabled={analysesPage === analysesTotalPages}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
