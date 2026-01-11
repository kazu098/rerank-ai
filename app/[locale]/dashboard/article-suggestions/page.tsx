"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";

interface ArticleSuggestion {
  id: string;
  user_id: string;
  site_id: string;
  title: string;
  keywords: string[];
  outline?: string[] | null;
  reason: string | null;
  estimated_impressions: number | null;
  priority: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export default function ArticleSuggestionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [loadingSites, setLoadingSites] = useState(true);
  const [suggestions, setSuggestions] = useState<ArticleSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "in_progress" | "completed" | "skipped">("all");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; site_url: string }>>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/`);
      return;
    }

    if (status === "authenticated") {
      fetchSites();
    }
  }, [status, router, locale]);

  useEffect(() => {
    if (status === "authenticated" && selectedSiteId && !loadingSites) {
      fetchSuggestions();
    }
  }, [status, selectedSiteId, filterStatus]);

  const fetchSites = async () => {
    try {
      setLoadingSites(true);
      const response = await fetch("/api/sites");
      if (response.ok) {
        const data = await response.json();
        // APIは直接sites配列を返す
        const sitesArray = Array.isArray(data) ? data : [];
        setSites(sitesArray);
        setLoadingSites(false);
        if (sitesArray.length > 0) {
          // URLパラメータからsite_idを取得
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const siteIdParam = params.get("site_id");
            if (siteIdParam) {
              // URLパラメータで指定されたサイトが存在するか確認
              const site = sitesArray.find((s: any) => s.id === siteIdParam);
              if (site) {
                setSelectedSiteId(siteIdParam);
              } else {
                // 指定されたサイトが見つからない場合は最初のサイトを選択
                setSelectedSiteId(sitesArray[0].id);
              }
            } else {
              // URLパラメータがない場合は最初のサイトを選択
              setSelectedSiteId(sitesArray[0].id);
            }
          } else {
            setSelectedSiteId(sitesArray[0].id);
          }
        } else {
          // サイトが存在しない場合もローディングを解除
          setLoading(false);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: t("errors.siteFetchFailed") }));
        setError(errorData.error || t("errors.siteFetchFailed"));
        setLoadingSites(false);
        setLoading(false);
      }
    } catch (err: any) {
      console.error("[ArticleSuggestions] Error fetching sites:", err);
      setError(err.message || t("errors.siteFetchFailed"));
      setLoadingSites(false);
      setLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    if (!selectedSiteId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("siteId", selectedSiteId);
      if (filterStatus !== "all") {
        params.append("status", filterStatus);
      }

      const response = await fetch(`/api/article-suggestions?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("errors.suggestionGenerationFailed"));
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setError(null);
    } catch (err: any) {
      console.error("[ArticleSuggestions] Error:", err);
      setError(err.message || t("errors.errorOccurred"));
    } finally {
      setLoading(false);
      setLoadingSites(false);
    }
  };

  const handleStatusUpdate = async (suggestionId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/article-suggestions/${suggestionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("errors.articleSuggestionStatusUpdateFailed"));
      }

      // 提案一覧を再読み込み
      await fetchSuggestions();
    } catch (err: any) {
      console.error("[ArticleSuggestions] Error updating status:", err);
      setError(err.message || t("errors.articleSuggestionStatusUpdateFailed"));
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

  if (error && !suggestions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchSuggestions}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  const filteredSuggestions = suggestions;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.articleSuggestions.title")}</h1>
          <a
            href={selectedSiteId ? `/?siteId=${selectedSiteId}&tab=suggestion` : "/?tab=suggestion"}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold"
          >
            {t("dashboard.articleSuggestions.generateNew")}
          </a>
        </div>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-gray-700">
            {t("dashboard.articleSuggestions.filterBySite")}:
          </label>
          <select
            value={selectedSiteId || ""}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.site_url}
              </option>
            ))}
          </select>

          <label className="text-sm font-medium text-gray-700 ml-4">
            {t("dashboard.articleSuggestions.filterByStatus")}:
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
          >
            <option value="all">{t("dashboard.articleSuggestions.all")}</option>
            <option value="pending">{t("home.status.pending")}</option>
            <option value="in_progress">{t("home.status.in_progress")}</option>
            <option value="completed">{t("home.status.completed")}</option>
            <option value="skipped">{t("home.status.skipped")}</option>
          </select>
        </div>
      </div>

      {/* 提案一覧 */}
      <div className="bg-white rounded-lg shadow">
        {filteredSuggestions.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <p>{t("dashboard.articleSuggestions.noSuggestions")}</p>
            <a
              href={selectedSiteId ? `/?siteId=${selectedSiteId}&tab=suggestion` : "/?tab=suggestion"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-purple-600 hover:text-purple-700 font-semibold"
            >
              {t("dashboard.articleSuggestions.generateNew")}
            </a>
          </div>
        ) : (
          <div className="divide-y">
            {filteredSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                onClick={() => {
                  // 記事のsite_idからサイトを選択状態にする
                  const site = sites.find(s => s.id === suggestion.site_id);
                  if (site) {
                    setSelectedSiteId(site.id);
                  }
                }}
                className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {suggestion.title}
                    </h3>
                    {suggestion.keywords && Array.isArray(suggestion.keywords) && suggestion.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {suggestion.keywords.slice(0, 5).map((keyword, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800"
                          >
                            {keyword}
                          </span>
                        ))}
                        {suggestion.keywords.length > 5 && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            +{suggestion.keywords.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                    {suggestion.reason && (
                      <p className="text-sm text-gray-600 mb-2">{suggestion.reason}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      {suggestion.estimated_impressions !== null && (
                        <span>
                          {t("home.estimatedImpressions")}: {suggestion.estimated_impressions.toLocaleString()}
                        </span>
                      )}
                      <span>
                        {t("dashboard.articleSuggestions.priority")}: {suggestion.priority}
                      </span>
                      <span>
                        {t("dashboard.articleSuggestions.createdAt")}: {new Date(suggestion.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {suggestion.status === "completed" && (
                      <span className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        {t("home.status.completed")}
                      </span>
                    )}
                    {suggestion.status === "skipped" && (
                      <span className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {t("home.status.skipped")}
                      </span>
                    )}
                    {(suggestion.status === "pending" || suggestion.status === "in_progress") && (
                      <div className="flex items-center gap-2">
                        {suggestion.status === "pending" && (
                          <button
                            onClick={() => handleStatusUpdate(suggestion.id, "in_progress")}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          >
                            {t("home.action.startCreating")}
                          </button>
                        )}
                        {suggestion.status === "in_progress" && (
                          <button
                            onClick={() => handleStatusUpdate(suggestion.id, "completed")}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                          >
                            {t("home.action.complete")}
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusUpdate(suggestion.id, "pending")}
                          className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                        >
                          {t("home.action.reset")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

