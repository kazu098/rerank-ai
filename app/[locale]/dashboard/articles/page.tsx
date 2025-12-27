"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

interface Article {
  id: string;
  url: string;
  title: string | null;
  current_average_position: number | null;
  previous_average_position: number | null;
  last_analyzed_at: string | null;
  is_monitoring: boolean;
  is_fixed: boolean | null;
  latestAnalysis: {
    id: string;
    average_position: number | null;
    previous_average_position: number | null;
    position_change: number | null;
    created_at: string;
  } | null;
}

export default function ArticlesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "monitoring" | "fixed">("all");
  const [sortBy, setSortBy] = useState<"date" | "position" | "title">("date");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}`);
      return;
    }

    if (status === "authenticated") {
      fetchArticles();
    }
  }, [status, filter, router, locale]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/dashboard/data");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "記事の取得に失敗しました");
      }

      const data = await response.json();
      let filteredArticles = data.articles || [];

      // フィルタリング
      if (filter === "monitoring") {
        filteredArticles = filteredArticles.filter((a: Article) => a.is_monitoring);
      } else if (filter === "fixed") {
        filteredArticles = filteredArticles.filter((a: Article) => a.is_fixed);
      }

      // ソート
      filteredArticles.sort((a: Article, b: Article) => {
        if (sortBy === "date") {
          const dateA = a.last_analyzed_at ? new Date(a.last_analyzed_at).getTime() : 0;
          const dateB = b.last_analyzed_at ? new Date(b.last_analyzed_at).getTime() : 0;
          return dateB - dateA; // 新しい順
        } else if (sortBy === "position") {
          const posA = a.latestAnalysis?.average_position ?? 999;
          const posB = b.latestAnalysis?.average_position ?? 999;
          return posA - posB; // 順位が良い順
        } else if (sortBy === "title") {
          const titleA = a.title || a.url;
          const titleB = b.title || b.url;
          return titleA.localeCompare(titleB);
        }
        return 0;
      });

      setArticles(filteredArticles);
    } catch (err: any) {
      console.error("[Articles] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchArticles();
    }
  }, [filter, sortBy]);

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchArticles}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダーとフィルタ */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">記事一覧</h1>
          <Link
            href={`/${locale}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            新しい記事を分析
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {/* フィルタ */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">フィルタ:</span>
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded text-sm ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              すべて ({articles.length})
            </button>
            <button
              onClick={() => setFilter("monitoring")}
              className={`px-3 py-1 rounded text-sm ${
                filter === "monitoring"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              監視中 ({articles.filter((a) => a.is_monitoring).length})
            </button>
            <button
              onClick={() => setFilter("fixed")}
              className={`px-3 py-1 rounded text-sm ${
                filter === "fixed"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              修正済み ({articles.filter((a) => a.is_fixed).length})
            </button>
          </div>

          {/* ソート */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-600">並び替え:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "position" | "title")}
              className="px-3 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="date">分析日時</option>
              <option value="position">平均順位</option>
              <option value="title">タイトル</option>
            </select>
          </div>
        </div>
      </div>

      {/* 記事一覧 */}
      <div className="bg-white rounded-lg shadow">
        <div className="divide-y">
          {articles.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <p>記事がありません</p>
              <Link
                href={`/${locale}`}
                className="mt-4 inline-block text-blue-600 hover:text-blue-700"
              >
                新しい記事を分析
              </Link>
            </div>
          ) : (
            articles.map((article) => (
              <div key={article.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">
                      {article.title || article.url}
                    </h3>
                    <p className="text-sm text-gray-500 mb-2 truncate">{article.url}</p>
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
                            {t("dashboard.articles.previousPosition")}:{" "}
                            {article.latestAnalysis.previous_average_position.toFixed(1)}位
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
                        {t("dashboard.articles.lastAnalyzed")}:{" "}
                        {new Date(article.last_analyzed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {article.is_monitoring && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                        {t("dashboard.articles.monitoring")}
                      </span>
                    )}
                    {article.is_fixed && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        修正済み
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
  );
}

