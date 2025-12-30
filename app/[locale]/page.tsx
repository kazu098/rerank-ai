"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname, Link } from "@/src/i18n/routing";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Image from "next/image";

// 分析モードは統一（タブを削除）

// 言語切り替えコンポーネント
function LanguageSwitcher({ locale, router, pathname }: { locale: string; router: any; pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'ja', label: '日本語', nativeLabel: '日本語' },
    { code: 'en', label: 'English', nativeLabel: 'English' },
  ];

  const currentLanguage = languages.find(lang => lang.code === locale) || languages[0];

  const handleLanguageChange = (newLocale: string) => {
    // パスは常に /[locale]/... の形式なので、先頭のロケールを置き換える
    const currentPath = pathname.replace(`/${locale}`, '') || '/';
    const newPath = `/${newLocale}${currentPath === '/' ? '' : currentPath}`;
    
    // クエリパラメータとハッシュも保持してリダイレクト
    const queryString = window.location.search;
    const hash = window.location.hash;
    window.location.href = newPath + queryString + hash;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{currentLanguage.code.toUpperCase()}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 min-w-[160px] z-20">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className="w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between text-sm"
              >
                <div>
                  <span className="text-gray-400 text-xs">{lang.code.toUpperCase()}</span>
                  <span className="text-white ml-2">{lang.nativeLabel}</span>
                </div>
                {locale === lang.code && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 順位をフォーマット（整数の場合は整数表示、小数がある場合は少数第2位まで）
function formatPosition(position: number | string): string {
  if (typeof position !== 'number') return String(position);
  return Number.isInteger(position) ? position.toFixed(0) : position.toFixed(2);
}

// キーワードの推移グラフコンポーネント
function KeywordTimeSeriesChart({ keywordTimeSeries }: { keywordTimeSeries: any[] }) {
  const t = useTranslations("chart");
  const locale = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(10); // 一度に表示するキーワード数
  const ITEMS_PER_PAGE = 10; // 1回あたりの追加表示数
  
  const topKeywords = keywordTimeSeries.slice(0, 3);
  const remainingKeywords = keywordTimeSeries.slice(3);

  const renderChart = (kwSeries: any, index: number) => {
    // グラフ用データに変換（日付をMM/DD形式に）
    const chartData = kwSeries.data.map((d: any) => ({
      date: new Date(d.date).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { month: "short", day: "numeric" }),
      position: d.position,
      impressions: d.impressions,
      clicks: d.clicks,
    }));

    // メタデータから警告情報を取得
    const metadata = kwSeries.metadata;
    const hasWarning = metadata?.hasRecentDrop || (metadata?.daysSinceLastData !== null && metadata?.daysSinceLastData >= 3);
    const isDataMissing = kwSeries.data.length === 0;

    return (
      <div key={index} className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm text-gray-700">
            {kwSeries.keyword}
          </h4>
          {hasWarning && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-semibold">
              ⚠️ {t("dropPossibility")}
            </span>
          )}
        </div>
        
        {/* 警告メッセージ */}
        {hasWarning && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3 rounded">
            <p className="text-sm text-yellow-800">
              {metadata?.serperApiNotFound ? (
                <>
                  <strong>⚠️ {t("dropDetected")}:</strong> {t("dropDetectedMessage")}
                  {metadata.lastPosition && (
                    <> {t("lastPositionInGSC", { position: metadata.lastPosition })}</>
                  )}
                </>
              ) : isDataMissing ? (
                <>
                  <strong>{t("attention")}:</strong> {t("noDataForKeyword")}
                  {metadata?.lastPosition && (
                    <> {t("lastRecordedPosition", { position: metadata.lastPosition })}</>
                  )}
                </>
              ) : metadata?.daysSinceLastData !== null && metadata.daysSinceLastData >= 3 ? (
                <>
                  <strong>{t("attention")}:</strong> {t("daysSinceLastData", { days: metadata.daysSinceLastData })}
                  {metadata.lastPosition && (
                    <> {t("lastRecordedPosition", { position: metadata.lastPosition })}</>
                  )}
                  {metadata.lastDataDate && (
                    <> {t("lastDataDate", { date: metadata.lastDataDate })}</>
                  )}
                </>
              ) : null}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {t("gscDataNote")}
            </p>
          </div>
        )}
        
        {isDataMissing ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-4 text-center text-sm text-gray-500">
            {t("noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis
              domain={["auto", "auto"]}
              reversed
              tick={{ fontSize: 12 }}
              label={{ value: t("rank"), angle: -90, position: "insideLeft" }}
            />
            <Tooltip formatter={(value: any) => typeof value === 'number' ? (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)) : value} />
            <Legend />
            <Line
              type="monotone"
              dataKey="position"
              stroke="#8b5cf6"
              strokeWidth={2}
              name={t("rank")}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    );
  };

  // 表示するキーワードを制限
  const displayedRemainingKeywords = remainingKeywords.slice(0, displayedCount);
  const hasMore = remainingKeywords.length > displayedCount;

  const handleShowMore = () => {
    setDisplayedCount(prev => Math.min(prev + ITEMS_PER_PAGE, remainingKeywords.length));
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-purple-200">
      <h3 className="font-bold text-lg mb-4 text-gray-800 border-l-4 border-purple-500 pl-3">
        📈 {t("keywordRankingTrend")}
      </h3>
      <div className="space-y-6">
        {topKeywords.map((kwSeries: any, index: number) => renderChart(kwSeries, index))}
      </div>
      
      {/* 残りのキーワードを展開表示（ページネーション対応） */}
      {remainingKeywords.length > 0 && (
        <div className="mt-6">
          <details 
            className="mt-6"
            onToggle={(e) => {
              const isOpen = (e.target as HTMLDetailsElement).open;
              setIsExpanded(isOpen);
              // 展開時に表示数をリセット
              if (isOpen && displayedCount > ITEMS_PER_PAGE) {
                setDisplayedCount(ITEMS_PER_PAGE);
              }
            }}
          >
            <summary className="cursor-pointer text-purple-600 hover:text-purple-800 font-semibold text-sm mb-4">
              {isExpanded ? t("collapse") : t("showMore", { count: remainingKeywords.length })}
            </summary>
            <div className="space-y-6 mt-4">
              {displayedRemainingKeywords.map((kwSeries: any, index: number) => renderChart(kwSeries, index + 3))}
              
              {/* さらに見るボタン */}
              {hasMore && (
                <div className="text-center mt-6">
                  <button
                    onClick={handleShowMore}
                    className="px-6 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-semibold text-sm"
                  >
                    {t("showMoreItems", { count: remainingKeywords.length - displayedCount })}
                  </button>
                </div>
              )}
              
              {/* すべて表示済みの場合 */}
              {!hasMore && displayedCount > 0 && (
                <div className="text-center mt-4 text-sm text-gray-500">
                  {t("allKeywordsShown", { count: remainingKeywords.length })}
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [articleUrl, setArticleUrl] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = not started, 1-7 = step number
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [maxKeywords, setMaxKeywords] = useState(3);
  const [maxCompetitorsPerKeyword, setMaxCompetitorsPerKeyword] = useState(3);
  
  // GSCプロパティ選択関連
  const [gscProperties, setGscProperties] = useState<any[]>([]);
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [showPropertySelection, setShowPropertySelection] = useState(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);

  // 記事選択関連
  const [articles, setArticles] = useState<any[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [showArticleSelection, setShowArticleSelection] = useState(false);
  const [articleSearchQuery, setArticleSearchQuery] = useState("");
  const [fetchingTitleUrls, setFetchingTitleUrls] = useState<Set<string>>(new Set());
  const [articlePage, setArticlePage] = useState(1);
  const articlesPerPage = 50;

  // 通知設定関連
  const [analyzedArticleId, setAnalyzedArticleId] = useState<string | null>(null);

  // タブ管理
  const [activeTab, setActiveTab] = useState<"analysis" | "suggestion">("analysis");

  // 記事提案関連
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [suggestionSiteUrl, setSuggestionSiteUrl] = useState<string>("");
  const [sites, setSites] = useState<Array<{ id: string; site_url: string }>>([]);


  const loadGSCProperties = async () => {
    if (propertiesLoaded) return; // 既に読み込み済みの場合はスキップ
    setLoadingProperties(true);
    setError(null);
    try {
      const response = await fetch("/api/gsc/properties");
      
      if (response.ok) {
        const result = await response.json();
        setGscProperties(result.properties || []);
        setPropertiesLoaded(true); // 読み込み完了フラグを設定
        if (result.properties && result.properties.length > 0) {
          setShowPropertySelection(true);
        }
      } else {
        const error = await response.json();
        // トークン期限切れの場合は即座にログイン画面に遷移
        if (error.code === "TOKEN_EXPIRED" || response.status === 401) {
            signOut({ callbackUrl: "/" });
          return;
        } else {
          setError(error.error || t("errors.propertyLoadFailed"));
        }
      }
    } catch (err: any) {
      console.error("[GSC] Error loading properties:", err);
      setError(err.message || t("errors.propertyLoadFailed"));
    } finally {
      setLoadingProperties(false);
    }
  };

  const handleSelectProperty = async (siteUrl: string) => {
    try {
      // データベースに保存
      const response = await fetch("/api/sites/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteUrl,
          displayName: siteUrl,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { error: responseText };
        }
        console.error("[GSC] Failed to save site:", error);
        setError(error.error || t("errors.propertySaveFailed"));
        return;
      }

      const result = JSON.parse(responseText);

      // 状態を更新
      setSelectedSiteUrl(siteUrl);
      setShowPropertySelection(false);
      
      // サイトIDを取得
      if (result.site?.id) {
        setSelectedSiteId(result.site.id);
      }
      
      // ローカルストレージに保存（次回アクセス時に使用）
      localStorage.setItem("selectedGSCSiteUrl", siteUrl);

      // 記事一覧を読み込む
      loadArticles(siteUrl);
    } catch (err: any) {
      console.error("[GSC] Error saving site:", err);
      setError(err.message || t("errors.propertySaveFailed"));
    }
  };

  const loadArticles = async (siteUrl: string) => {
    setLoadingArticles(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/list?siteUrl=${encodeURIComponent(siteUrl)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("errors.articleListLoadFailed"));
      }

      const result = await response.json();
      setArticles(result.articles || []);
      setShowArticleSelection(true);
      setArticlePage(1); // ページをリセット
    } catch (err: any) {
      console.error("[Articles] Error loading articles:", err);
      setError(err.message || t("errors.articleListLoadFailed"));
    } finally {
      setLoadingArticles(false);
    }
  };

  const fetchArticleTitle = async (url: string, siteUrl: string) => {
    // 既に取得中の場合はスキップ
    if (fetchingTitleUrls.has(url)) {
      return;
    }

    setFetchingTitleUrls((prev) => new Set(prev).add(url));
    try {
      const response = await fetch("/api/articles/fetch-title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, siteUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("errors.titleFetchFailed"));
      }

      const result = await response.json();

      // 記事一覧を更新
      setArticles((prev) =>
        prev.map((article) =>
          article.url === url
            ? { ...article, title: result.title, hasTitleInDb: true }
            : article
        )
      );
    } catch (err: any) {
      console.error("[Articles] Error fetching title:", err);
      alert(`${t("errors.titleFetchFailed")}: ${err.message}`);
    } finally {
      setFetchingTitleUrls((prev) => {
        const newSet = new Set(prev);
        newSet.delete(url);
        return newSet;
      });
    }
  };

  const handleSelectArticle = (url: string) => {
    setArticleUrl(url);
    setShowArticleSelection(false);
  };

  // 提案一覧を読み込む
  const loadSuggestions = async (siteId: string) => {
    setLoadingSuggestions(true);
    try {
      const response = await fetch(`/api/article-suggestions?siteId=${siteId}`);
      if (response.ok) {
        const result = await response.json();
        setSuggestions(result.suggestions || []);
      }
    } catch (err: any) {
      console.error("Error loading suggestions:", err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // GSCプロパティ一覧を取得
  useEffect(() => {
    if (status === "authenticated" && session?.accessToken && !selectedSiteUrl && !loadingProperties && !propertiesLoaded) {
      loadGSCProperties();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.accessToken, selectedSiteUrl]);

  // URLパラメータからsiteIdとtabを受け取る
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const siteIdParam = params.get("siteId");
      const tabParam = params.get("tab");
      
      if (tabParam === "suggestion") {
        setActiveTab("suggestion");
      }
      
      if (siteIdParam && status === "authenticated") {
        // サイト一覧を取得して、siteIdに対応するサイトURLを設定
        fetch("/api/sites")
          .then((res) => res.json())
          .then((data) => {
            const sitesArray = Array.isArray(data) ? data : [];
            setSites(sitesArray);
            const site = sitesArray.find((s: any) => s.id === siteIdParam);
            if (site) {
              setSuggestionSiteUrl(site.site_url);
              setSelectedSiteId(siteIdParam);
            }
          })
          .catch((err) => console.error("Error fetching sites:", err));
      }
    }
  }, [status]);

  // 選択中のプロパティが変更されたら、新規記事提案タブのテキストフィールドも更新
  useEffect(() => {
    if (selectedSiteUrl) {
      // https://形式に統一
      let normalizedUrl = selectedSiteUrl;
      if (normalizedUrl.startsWith("sc-domain:")) {
        const domain = normalizedUrl.replace("sc-domain:", "");
        normalizedUrl = `https://${domain}/`;
      } else if (!normalizedUrl.startsWith("https://") && !normalizedUrl.startsWith("http://")) {
        normalizedUrl = `https://${normalizedUrl}/`;
      }
      setSuggestionSiteUrl(normalizedUrl);
    }
  }, [selectedSiteUrl]);

  // ローカルストレージから選択済みプロパティを読み込む
  useEffect(() => {
    if (status === "authenticated" && session?.accessToken && session?.userId) {
      const savedSiteUrl = localStorage.getItem("selectedGSCSiteUrl");
      if (savedSiteUrl && !selectedSiteUrl) {
        // データベースに保存されているか確認し、保存されていない場合は保存する
        (async () => {
          try {
            const response = await fetch("/api/sites/save", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                siteUrl: savedSiteUrl,
                displayName: savedSiteUrl,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              setSelectedSiteUrl(savedSiteUrl);
              // サイトIDを取得
              if (result.site?.id) {
                setSelectedSiteId(result.site.id);
              }
              // 記事一覧を読み込む
              loadArticles(savedSiteUrl);
            } else {
              const error = await response.json();
              console.error("[GSC] Failed to save site from localStorage:", error);
              // エラーが発生した場合は、ローカルストレージをクリアしてプロパティ選択画面を表示
              localStorage.removeItem("selectedGSCSiteUrl");
              setShowPropertySelection(true);
            }
          } catch (err: any) {
            console.error("[GSC] Error saving site from localStorage:", err);
            // エラーが発生した場合は、ローカルストレージをクリアしてプロパティ選択画面を表示
            localStorage.removeItem("selectedGSCSiteUrl");
            setShowPropertySelection(true);
          }
        })();
      }
    }
  }, [status, session?.accessToken, session?.userId]);

  const startAnalysis = async () => {
    if (!selectedSiteUrl) {
      setError(t("errors.propertyNotSelected"));
      return;
    }

    // 今日既に分析されているかチェックし、分析結果を取得
    try {
      const checkResponse = await fetch("/api/articles/check-recent-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: articleUrl,
        }),
      });

      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        if (checkResult.analyzedToday) {
          // 今日既に分析されている場合は、DBから分析結果を取得して表示
          const latestAnalysisResponse = await fetch("/api/analysis/get-latest-by-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: articleUrl,
            }),
          });

          if (latestAnalysisResponse.ok) {
            const latestAnalysisData = await latestAnalysisResponse.json();
            if (latestAnalysisData.hasAnalysis && latestAnalysisData.analysisResult) {
              // 分析結果を表示
              setData(latestAnalysisData.analysisResult);
              setCompletedSteps(new Set([1, 2, 3, 4, 5, 6, 7]));
              setCurrentStep(0);
              setLoading(false);
              // 記事IDを保存（通知設定ボタン表示用）
              if (latestAnalysisData.articleId) {
                setAnalyzedArticleId(latestAnalysisData.articleId);
              }
              return; // 新しい分析を実行せずに終了
            }
          }
        }
      }
    } catch (checkError: any) {
      console.error("[Analysis] Error checking recent analysis:", checkError);
      // チェックエラーは無視して続行
    }

    setLoading(true);
    setError(null);
    setData(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    
    const analysisStartTime = Date.now();

    try {
      const urlObj = new URL(articleUrl);
      // GSCプロパティとして選択されたsiteUrlを使用
      const siteUrl = selectedSiteUrl.replace(/\/$/, ""); // 末尾のスラッシュを削除
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
      
      // 分析実行（段階的に実行）
      
      // Step 1: 記事の検索順位データを取得中
      setCurrentStep(1);
      const step1Response = await fetch("/api/competitors/analyze-step1", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({
          siteUrl,
          pageUrl,
          maxKeywords,
        }),
      });

      if (!step1Response.ok) {
        const errorData = await step1Response.json();
        throw new Error(errorData.error || "Step 1に失敗しました");
      }

      const step1Result = await step1Response.json();
      // Step 1の結果をすぐに表示
      let currentAnalysisResult = {
        ...step1Result,
        competitorResults: [],
        uniqueCompetitorUrls: [],
      };
      setData(currentAnalysisResult);
      // Step 1-3が完了（GSCデータ取得、キーワード特定、キーワード選定）
      setCompletedSteps(prev => new Set([1, 2, 3]));
      setCurrentStep(4); // Step 4: 競合サイトのURLを収集中

      // Step 2: 競合URL抽出
      const step2Response = await fetch("/api/competitors/analyze-step2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteUrl,
          pageUrl,
          prioritizedKeywords: step1Result.prioritizedKeywords,
          maxCompetitorsPerKeyword,
        }),
      });

      if (!step2Response.ok) {
        const errorData = await step2Response.json();
        throw new Error(errorData.error || "Step 2に失敗しました");
      }

      const step2Result = await step2Response.json();
      
      // Step 2の結果から、Serper APIで見つからなかったキーワードを検出
      // （100位以下に転落している可能性）
      if (step2Result.competitorResults && currentAnalysisResult?.keywordTimeSeries) {
        const updatedTimeSeries = currentAnalysisResult.keywordTimeSeries.map((kwSeries: any) => {
          const competitorResult = step2Result.competitorResults.find(
            (cr: any) => cr.keyword === kwSeries.keyword
          );
          
          // Serper APIで自社URLが見つからなかった場合、100位以下に転落している可能性が高い
          const isNotFoundInSerper = competitorResult && !competitorResult.ownPosition;
          
          if (isNotFoundInSerper && kwSeries.metadata) {
            return {
              ...kwSeries,
              metadata: {
                ...kwSeries.metadata,
                hasRecentDrop: true, // Serper APIで見つからない場合は転落とみなす
                serperApiNotFound: true, // Serper APIで見つからなかったフラグ
              }
            };
          }
          return kwSeries;
        });
        
        // 時系列データを更新
        currentAnalysisResult = {
          ...currentAnalysisResult,
          ...step2Result,
          keywordTimeSeries: updatedTimeSeries,
        };
        setData(currentAnalysisResult);
      } else {
        // Step 2の結果を更新
        currentAnalysisResult = {
          ...currentAnalysisResult,
          ...step2Result,
        };
        setData(currentAnalysisResult);
      }
      setCompletedSteps(prev => new Set(prev).add(4));
      setCurrentStep(5); // Step 5: 競合記事の内容を読み込み中

      // Step 3: 記事スクレイピング + LLM分析
      if (step2Result.uniqueCompetitorUrls.length > 0) {
        setCompletedSteps(prev => new Set(prev).add(5));
        setCurrentStep(6); // Step 6: AIが記事の差分を分析中
        
        const step3Response = await fetch("/api/competitors/analyze-step3", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            siteUrl,
            pageUrl,
            prioritizedKeywords: step1Result.prioritizedKeywords,
            competitorResults: step2Result.competitorResults,
            uniqueCompetitorUrls: step2Result.uniqueCompetitorUrls,
            skipLLMAnalysis: false,
          }),
        });

        if (!step3Response.ok) {
          const errorData = await step3Response.json();
          // Step 3が失敗しても、Step 1とStep 2の結果は表示
          console.error("Step 3 failed:", errorData);
          setCompletedSteps(prev => new Set([...Array.from(prev), 5, 6, 7]));
          setCurrentStep(0); // 完了（エラーでも完了としてマーク）
        } else {
          const step3Result = await step3Response.json();
          // Step 3の結果を更新
          currentAnalysisResult = {
            ...currentAnalysisResult,
            ...step3Result,
          };
          setData(currentAnalysisResult);
          // Step 6-7が完了（AI分析、改善提案生成）
          setCompletedSteps(prev => new Set([...Array.from(prev), 6, 7]));
          setCurrentStep(0); // 完了
        }
      } else {
        // Step 3がスキップされた場合も、すべてのステップを完了としてマーク
        setCompletedSteps(prev => new Set([...Array.from(prev), 5, 6, 7]));
        setCurrentStep(0); // 完了
      }

      // 分析結果をDBに保存
      if (currentAnalysisResult && currentAnalysisResult.prioritizedKeywords) {
        try {
          const analysisDurationSeconds = Math.floor((Date.now() - analysisStartTime) / 1000);
          const saveResponse = await fetch("/api/analysis/save", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              articleUrl,
              siteUrl: selectedSiteUrl.replace(/\/$/, ""),
              analysisResult: currentAnalysisResult,
              analysisDurationSeconds,
            }),
          });

          if (saveResponse.ok) {
            const saveResult = await saveResponse.json();
            console.log("[Analysis] Saved to database:", saveResult);
            // 記事IDを保存（通知設定ボタン表示用）
            if (saveResult.articleId) {
              setAnalyzedArticleId(saveResult.articleId);
            }
          } else {
            const errorData = await saveResponse.json();
            console.error("[Analysis] Failed to save to database:", errorData);
            // DB保存の失敗は警告のみ（分析結果は表示される）
          }
        } catch (saveError: any) {
          console.error("[Analysis] Error saving to database:", saveError);
          // DB保存のエラーは警告のみ（分析結果は表示される）
        }
      }

      // 分析完了
    } catch (err: any) {
      setError(err.message);
      setCurrentStep(0);
      setCompletedSteps(new Set());
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    if (!notificationEmail || !data) return;

    setSendingNotification(true);
    try {
      const urlObj = new URL(articleUrl);
      const siteUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");

      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientEmail: notificationEmail,
          siteUrl,
          pageUrl,
          analysisResult: data,
        }),
      });

      if (!response.ok) {
        throw new Error("通知の送信に失敗しました");
      }

      alert("通知を送信しました");
    } catch (err: any) {
      alert(`通知の送信に失敗しました: ${err.message}`);
    } finally {
      setSendingNotification(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">{t("common.loading")}</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white">
        {/* ナビゲーションヘッダー */}
        <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href={`/`} className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                  <Image 
                    src="/logo.svg" 
                    alt="ReRank AI" 
                    width={32} 
                    height={32}
                    className="w-8 h-8"
                    onError={(e) => {
                      // ロゴファイルが存在しない場合は非表示にする
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span>ReRank AI</span>
                </Link>
            </div>
              <div className="hidden md:flex items-center space-x-8">
                <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
                  {t("navigation.features")}
                </a>
                <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
                  {t("navigation.howItWorks")}
                </a>
                <button
                  onClick={() => {
                    const sessionAny = session as any;
                    if (sessionAny?.user?.email) {
                      localStorage.setItem('lastEmail', sessionAny.user.email);
                    }
                    signIn("google", { callbackUrl: `/${locale}` });
                  }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                >
                  {t("navigation.getStarted")}
                </button>
                </div>
              <div className="md:hidden">
                <button
                  onClick={() => {
                    const sessionAny = session as any;
                    if (sessionAny?.user?.email) {
                      localStorage.setItem('lastEmail', sessionAny.user.email);
                    }
                    signIn("google", { callbackUrl: `/${locale}` });
                  }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                  {t("navigation.getStarted")}
                </button>
                </div>
              </div>
            </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ヒーローセクション - 分析開始UI */}
          <section className="py-12 md:py-16">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
                {t("home.heroTitle")}
              </h1>
              <p className="text-base md:text-lg text-gray-600 mb-6">
                {t("home.heroSubtitle").split('\n').map((line: string, i: number) => (
                  <span key={i}>
                    {line}
                    {i < t("home.heroSubtitle").split('\n').length - 1 && <br />}
                  </span>
                ))}
              </p>
                  </div>

            {/* 簡単な説明 */}
            <div className="max-w-2xl mx-auto mb-6">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                <p className="text-xs text-blue-700 whitespace-nowrap">
                  <strong>{t("auth.accountInfoDescription")}</strong>
                </p>
              </div>
            </div>

            {/* CTAボタン */}
            <div className="text-center mb-8">
              <button
                onClick={() => {
                  const sessionAny = session as any;
                  if (sessionAny?.user?.email) {
                    localStorage.setItem('lastEmail', sessionAny.user.email);
                  }
                  signIn("google", { callbackUrl: `/${locale}` });
                }}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg hover:opacity-90 transition-all shadow-lg font-bold text-lg inline-flex items-center"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t("home.ctaButton")}
              </button>
            </div>

            {/* デモ動画 */}
            <div className="max-w-4xl mx-auto">
              <div className="relative aspect-video rounded-lg overflow-hidden shadow-xl border border-gray-200 bg-gray-100">
                <video
                  className="w-full h-full object-contain"
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                >
                  <source src="/videos/demo.mp4" type="video/mp4" />
                  {t("home.videoNotSupported")}
                </video>
          </div>
            </div>
          </section>

          {/* 機能紹介セクション */}
          <section id="features" className="py-20 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-20">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
                {t("home.features.title")}
              </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {/* 機能1 */}
              <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                  {t("home.features.feature1.title")}
                </h3>
                <p className="text-gray-600 text-center">
                  {t("home.features.feature1.description")}
                </p>
              </div>

              {/* 機能2 */}
              <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                  {t("home.features.feature2.title")}
                </h3>
                <p className="text-gray-600 text-center">
                  {t("home.features.feature2.description")}
                </p>
              </div>

              {/* 機能3 */}
              <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                  {t("home.features.feature3.title")}
                </h3>
                <p className="text-gray-600 text-center">
                  {t("home.features.feature3.description")}
                </p>
              </div>

              {/* 機能4: 新規記事提案 */}
              <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                  {t("home.features.feature4.title")}
                </h3>
                <p className="text-gray-600 text-center">
                  {t("home.features.feature4.description")}
                </p>
              </div>
            </div>
          </div>
          </section>

          {/* 使い方セクション */}
          <section id="how-it-works" className="py-20 mb-20">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
                {t("home.howItWorks.title")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Step 1 */}
              <div className="text-center">
                <div className="w-20 h-20 bg-purple-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-6 mx-auto">
                  1
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  {t("home.howItWorks.step1.title")}
                </h3>
                <p className="text-gray-600">
                  {t("home.howItWorks.step1.description")}
                </p>
              </div>

              {/* Step 2 */}
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-6 mx-auto">
                  2
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  {t("home.howItWorks.step2.title")}
                </h3>
                <p className="text-gray-600">
                  {t("home.howItWorks.step2.description")}
                </p>
              </div>

              {/* Step 3 */}
              <div className="text-center">
                <div className="w-20 h-20 bg-indigo-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-6 mx-auto">
                  3
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  {t("home.howItWorks.step3.title")}
                </h3>
                <p className="text-gray-600">
                  {t("home.howItWorks.step3.description")}
                </p>
              </div>
            </div>
          </div>
          </section>
        </div>

        {/* フッター */}
        <footer className="bg-gray-900 text-gray-400 mt-20 w-full pt-12 pb-8 rounded-t-3xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
                {/* サービス */}
                <div>
                  <h3 className="text-white font-semibold text-sm mb-4">{t("footer.service.title")}</h3>
                  <ul className="space-y-3">
                    <li>
                      <a href="#features" className="text-sm hover:text-white transition-colors">
                        {t("footer.service.features")}
                      </a>
                    </li>
                    <li>
                      <a href="#how-it-works" className="text-sm hover:text-white transition-colors">
                        {t("footer.service.howItWorks")}
                      </a>
                    </li>
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.service.pricing")}
                      </a>
                    </li>
                  </ul>
                </div>

                {/* リソース */}
                <div>
                  <h3 className="text-white font-semibold text-sm mb-4">{t("footer.resources.title")}</h3>
                  <ul className="space-y-3">
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.resources.blog")}
                      </a>
                    </li>
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.resources.documentation")}
                      </a>
                    </li>
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.resources.faq")}
                      </a>
                    </li>
                  </ul>
                </div>

                {/* 会社情報 */}
                <div>
                  <h3 className="text-white font-semibold text-sm mb-4">{t("footer.company.title")}</h3>
                  <ul className="space-y-3">
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.company.contact")}
                      </a>
                    </li>
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.company.privacyPolicy")}
                      </a>
                    </li>
                    <li>
                      <a href="#" className="text-sm hover:text-white transition-colors">
                        {t("footer.company.termsOfService")}
                      </a>
                    </li>
                  </ul>
                </div>

                {/* ソーシャル */}
                <div>
                  <h3 className="text-white font-semibold text-sm mb-4">{t("footer.social.title")}</h3>
                  <ul className="space-y-3">
                    <li>
                      <a href="#" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        {t("footer.social.twitter")}
                      </a>
                    </li>
                    <li>
                      <a href="#" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                          <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                        </svg>
                        GitHub
                      </a>
                    </li>
                  </ul>
                </div>
              </div>

            {/* コピーライトと言語切り替え */}
            <div className="mt-12 pt-8 border-t border-gray-800">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-sm text-gray-500 text-center md:text-left">
                  &copy; {new Date().getFullYear()} ReRank AI. {t("footer.allRightsReserved")}
                </p>
                {/* 言語切り替え */}
                <LanguageSwitcher locale={locale} router={router} pathname={pathname} />
          </div>
        </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <header className="text-center mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-4xl font-extrabold text-gray-900">
              ReRank AI
            </h1>
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
              >
                {t("dashboard.title")}
              </Link>
              <button
                onClick={() => signOut()}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 text-sm"
              >
                {t("common.logout")}
              </button>
            </div>
          </div>
          <p className="text-gray-600 italic">
            {t("home.subtitle")}
          </p>
        </header>

        {/* GSCプロパティ選択画面 */}
        {showPropertySelection && !selectedSiteUrl && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-purple-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {t("home.selectProperty")}
            </h2>
            <p className="text-gray-600 mb-6">
              {t("home.selectPropertyDescription")}
            </p>

            {loadingProperties ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <p className="mt-4 text-gray-600">{t("home.propertyLoading")}</p>
              </div>
            ) : gscProperties.length === 0 ? (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      {t("gsc.noPropertiesFound")}
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p className="mb-2">
                        {t("gsc.noAccessRights")}
                      </p>
                      <p>
                        <strong>{t("gsc.solution")}:</strong>
                      </p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>{t("gsc.solution1")}</li>
                        <li>{t("gsc.solution2")}</li>
                        <li>{t("gsc.solution3")}</li>
                      </ul>
                      <a 
                        href="https://search.google.com/search-console" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mt-3 inline-block text-purple-600 hover:underline font-semibold"
                      >
                        Search Consoleを開く →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {gscProperties.map((property: any) => (
                  <button
                    key={property.siteUrl}
                    onClick={() => handleSelectProperty(property.siteUrl)}
                    className="w-full text-left p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{property.siteUrl}</p>
                        {property.permissionLevel && (
                          <p className="text-sm text-gray-500 mt-1">
                            {t("gsc.permissionLevel")}: {property.permissionLevel}
                          </p>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 選択済みプロパティの表示 */}
        {selectedSiteUrl && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 rounded">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-800">
                  {t("home.selectedProperty")}: {selectedSiteUrl}
                </p>
                <button
                  onClick={() => {
                    setSelectedSiteUrl(null);
                    setShowPropertySelection(true);
                    localStorage.removeItem("selectedGSCSiteUrl");
                  }}
                  className="text-sm text-green-600 hover:underline mt-1"
                >
                  {t("home.selectAnotherProperty")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* メインコンテンツ（プロパティ選択済みの場合のみ表示） */}
        {selectedSiteUrl && (
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-purple-200">
          {/* タブUI */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab("analysis")}
              className={`px-6 py-3 font-semibold text-sm transition-colors ${
                activeTab === "analysis"
                  ? "text-purple-600 border-b-2 border-purple-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("home.analyzeArticle")}
            </button>
            <button
              onClick={() => setActiveTab("suggestion")}
              className={`px-6 py-3 font-semibold text-sm transition-colors ${
                activeTab === "suggestion"
                  ? "text-purple-600 border-b-2 border-purple-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("home.newArticleSuggestion") || "新規記事提案"}
            </button>
          </div>

          {/* タブコンテンツ */}
          {activeTab === "analysis" ? (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {t("home.analyzeArticle")}
            </h2>
            <p className="text-gray-600 mb-6">
              {t("home.analyzeArticleDescription")}
            </p>

          {/* 記事選択セクション */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-bold text-gray-700">
                {t("article.select")}
              </label>
              <button
                onClick={() => {
                  if (showArticleSelection) {
                    setShowArticleSelection(false);
                  } else {
                    loadArticles(selectedSiteUrl);
                  }
                }}
                className="text-sm text-purple-600 hover:text-purple-800 font-semibold"
              >
                {showArticleSelection ? t("article.close") : t("article.showArticleList")}
              </button>
            </div>

            {showArticleSelection && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                {loadingArticles ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                    <p className="mt-2 text-sm text-gray-600">{t("article.loadingArticles")}</p>
                  </div>
                ) : articles.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {t("article.noArticlesFound")}
                  </p>
                ) : (
                  <>
                    {/* 検索バー */}
                    <div className="mb-4">
                      <input
                        type="text"
                        value={articleSearchQuery}
                        onChange={(e) => {
                          setArticleSearchQuery(e.target.value);
                          setArticlePage(1); // 検索時にページをリセット
                        }}
                        placeholder={t("article.searchPlaceholder")}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                      />
                    </div>

                    {/* 記事一覧 */}
                    <div className="space-y-2">
                      {(() => {
                        const filteredArticles = articles.filter((article) => {
                          if (!articleSearchQuery) return true;
                          const query = articleSearchQuery.toLowerCase();
                          return (
                            article.url.toLowerCase().includes(query) ||
                            (article.title && article.title.toLowerCase().includes(query))
                          );
                        });
                        
                        const totalPages = Math.ceil(filteredArticles.length / articlesPerPage);
                        const startIndex = (articlePage - 1) * articlesPerPage;
                        const endIndex = startIndex + articlesPerPage;
                        const paginatedArticles = filteredArticles.slice(startIndex, endIndex);
                        
                        return paginatedArticles.map((article, index) => (
                          <div
                            key={index}
                            className="bg-white border border-gray-200 rounded-lg p-3 hover:border-purple-400 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                {article.title ? (
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <p className="font-semibold text-sm text-gray-900 line-clamp-1">
                                        {article.title}
                                      </p>
                                      {article.last_analyzed_at && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                          {t("dashboard.articles.analyzed")}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">
                                      {article.url}
                                    </p>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <p className="text-sm text-gray-700 truncate">
                                        {article.url}
                                      </p>
                                      {article.last_analyzed_at && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                          {t("dashboard.articles.analyzed")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                  <span>{t("article.impressions")}: {article.impressions.toLocaleString()}</span>
                                  <span>{t("article.clicks")}: {article.clicks.toLocaleString()}</span>
                                  {article.position && (
                                    <span>{t("article.avgPosition")}: {formatPosition(article.position)}{t("results.rankSuffix")}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {!article.title && (
                                  <button
                                    onClick={() => fetchArticleTitle(article.url, selectedSiteUrl)}
                                    disabled={fetchingTitleUrls.has(article.url)}
                                    className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {fetchingTitleUrls.has(article.url) ? t("article.fetchingTitleInProgress") : t("article.fetchingTitle")}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleSelectArticle(article.url)}
                                  className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                                >
                                  {t("article.selectButton")}
                                </button>
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    
                    {/* ページネーション */}
                    {(() => {
                      const filteredArticles = articles.filter((article) => {
                        if (!articleSearchQuery) return true;
                        const query = articleSearchQuery.toLowerCase();
                        return (
                          article.url.toLowerCase().includes(query) ||
                          (article.title && article.title.toLowerCase().includes(query))
                        );
                      });
                      
                      const totalPages = Math.ceil(filteredArticles.length / articlesPerPage);
                      const startIndex = (articlePage - 1) * articlesPerPage;
                      const endIndex = Math.min(startIndex + articlesPerPage, filteredArticles.length);
                      
                      if (filteredArticles.length <= articlesPerPage) {
                        return null;
                      }
                      
                      return (
                        <div className="mt-4">
                          <p className="text-xs text-gray-500 text-center mb-3">
                            {t("article.displayingItems", { displayed: endIndex, total: filteredArticles.length })}
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setArticlePage(1)}
                              disabled={articlePage === 1}
                              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              最初
                            </button>
                            <button
                              onClick={() => setArticlePage(articlePage - 1)}
                              disabled={articlePage === 1}
                              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              前へ
                            </button>
                            <span className="text-xs text-gray-700 px-3">
                              {articlePage} / {totalPages}
                            </span>
                            <button
                              onClick={() => setArticlePage(articlePage + 1)}
                              disabled={articlePage >= totalPages}
                              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              次へ
                            </button>
                            <button
                              onClick={() => setArticlePage(totalPages)}
                              disabled={articlePage >= totalPages}
                              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              最後
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>

          {/* 入力フォーム */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              {t("article.articleUrl")}
            </label>
            <input
              type="text"
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t("article.articleUrlHint")}
            </p>
          </div>

          {/* オプション設定（折りたたみ可能） */}
          <details className="mb-6">
            <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800 mb-2">
              {t("options.title")}
            </summary>
            <div className="mt-4 space-y-4 bg-gray-50 p-4 rounded-lg">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t("options.maxKeywords")}: {maxKeywords}
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={maxKeywords}
                  onChange={(e) => setMaxKeywords(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t("options.maxCompetitors")}: {maxCompetitorsPerKeyword}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={maxCompetitorsPerKeyword}
                  onChange={(e) => setMaxCompetitorsPerKeyword(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t("options.notificationEmail")}
                </label>
                <input
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder={t("options.notificationEmailPlaceholder")}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          </details>

          {/* 実行ボタン */}
          <button
            onClick={startAnalysis}
            disabled={loading || !articleUrl || !selectedSiteUrl}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-4 rounded-lg hover:opacity-90 transition-all shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                <span>{t("home.analyzing")}</span>
              </>
            ) : (
              <span>{t("home.startAnalysis")}</span>
            )}
          </button>

          {/* ステップインジケーター */}
          {loading && (
          <div className="bg-white p-6 rounded-xl border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("analysis.progress")}</h3>
            <div className="space-y-4">
              {[
                { step: 1, key: "step1", label: t("analysis.step1") },
                { step: 2, key: "step2", label: t("analysis.step2") },
                { step: 3, key: "step3", label: t("analysis.step3") },
                { step: 4, key: "step4", label: t("analysis.step4") },
                { step: 5, key: "step5", label: t("analysis.step5") },
                { step: 6, key: "step6", label: t("analysis.step6") },
                { step: 7, key: "step7", label: t("analysis.step7") },
              ].map(({ step, key, label }) => {
                const isActive = currentStep === step;
                const isCompleted = completedSteps.has(step);
                const isPending = currentStep < step;
                
                return (
                  <div key={key} className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full border-2 transition-colors">
                      {isCompleted ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isActive ? (
                        <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${isActive ? 'text-purple-600 font-semibold' : isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                        {label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

            {/* エラー表示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
                <p className="text-red-800 font-semibold">{t("common.error")}</p>
                <p className="text-red-600">{error}</p>
              </div>
            )}

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <p className="text-red-800 font-semibold">{t("common.error")}</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* 結果表示エリア - 2列レイアウト */}
          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左列: 検索順位データ・キーワード分析 */}
          <div className="space-y-6">
            {/* 上位を保てているキーワード（安心させる） */}
            {data.topRankingKeywords && data.topRankingKeywords.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-bold text-lg mb-3 text-green-800">
                  {t("results.topRankingKeywords")}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  {t("results.topRankingDescription")}
                </p>
                <div className="space-y-2">
                  {data.topRankingKeywords.map((kw: any, index: number) => (
                    <div key={index} className="bg-white p-3 rounded border border-green-300">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{kw.keyword}</span>
                        <span className="text-xs text-green-600 font-bold">
                            {typeof kw.position === 'number' ? formatPosition(kw.position) : kw.position}{t("results.rankSuffix")}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        <span>{t("article.impressions")}: {kw.impressions}</span>
                        <span className="ml-4">{t("article.clicks")}: {kw.clicks}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* キーワードの推移グラフ */}
            {data.keywordTimeSeries && data.keywordTimeSeries.length > 0 && (
              <KeywordTimeSeriesChart keywordTimeSeries={data.keywordTimeSeries} />
            )}
            </div>

            {/* 右列: 競合URL・改善案 */}
            <div className="space-y-6">
            {/* サマリーカード */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-purple-500">
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 flex items-center justify-between shadow-inner">
                <span className="font-bold">{t("results.rankUpBooster")}</span>
                {data.prioritizedKeywords && data.prioritizedKeywords.length > 0 && (
                  <span className="text-xs bg-white text-purple-600 px-2 py-1 rounded font-bold">
                    {t("results.keywordsAnalyzed", { count: data.prioritizedKeywords.length })}
                  </span>
                )}
              </div>
              <div className="p-6">
                {data.semanticDiffAnalysis?.semanticAnalysis?.whyCompetitorsRankHigher && (
                  <div className="flex items-center mb-6 text-purple-700 font-bold p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                    </svg>
                    {data.semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher}
                  </div>
                )}

                {/* キーワード固有の分析結果（最優先） */}
                {data.semanticDiffAnalysis && data.semanticDiffAnalysis.keywordSpecificAnalysis.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-bold text-lg mb-4 text-gray-800 border-l-4 border-purple-500 pl-3">
                      {t("results.keywordSpecificAnalysis")}
                    </h3>
                    <div className="space-y-4">
                      {data.semanticDiffAnalysis.keywordSpecificAnalysis.map((kwAnalysis: any, i: number) => (
                        <div key={i} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <p className="font-semibold text-sm mb-2">{t("results.keyword")}: {kwAnalysis.keyword}</p>
                          <p className="text-sm mb-3">
                            <strong>{t("results.whyRankingDropped")}:</strong> {kwAnalysis.whyRankingDropped}
                          </p>
                          {kwAnalysis.whatToAdd && kwAnalysis.whatToAdd.length > 0 && (
                            <>
                              <div>
                                <strong className="text-sm">{t("results.whatToAdd")}:</strong>
                                <ul className="list-none space-y-2 mt-2">
                                  {kwAnalysis.whatToAdd.map((itemData: any, j: number) => {
                                    const item = typeof itemData === 'string' ? itemData : itemData.item;
                                    const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
                                    
                                    return (
                                      <li key={j} className="text-sm flex items-start gap-2">
                                        <span className="flex-shrink-0">・</span>
                                        <span className="flex-1">{item}</span>
                                        {competitorUrls && competitorUrls.length > 0 && (
                                          <span className="text-xs text-gray-500 flex-shrink-0">
                                            {t("results.competitorSites", { count: competitorUrls.length })}
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                              {/* 競合サイトURLをまとめて表示 */}
                              {kwAnalysis.whatToAdd && kwAnalysis.whatToAdd.some((itemData: any) => {
                                const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
                                return competitorUrls && competitorUrls.length > 0;
                              }) && (
                                <details className="mt-3 pt-3 border-t border-gray-200">
                                  <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                    {t("results.competitorUrls")}
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    {kwAnalysis.whatToAdd.map((itemData: any, j: number) => {
                                      const item = typeof itemData === 'string' ? itemData : itemData.item;
                                      const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
                                      if (!competitorUrls || competitorUrls.length === 0) return null;
                                      
                                      return (
                                        <div key={j} className="text-xs">
                                          <p className="font-semibold text-gray-700 mb-1">{item}</p>
                                          <ul className="list-none space-y-1 ml-2">
                                            {competitorUrls.map((url: string, k: number) => (
                                              <li key={k}>
                                                <a 
                                                  href={url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:text-blue-800 underline break-all"
                                                >
                                                  {url}
                                                </a>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 詳細な分析結果（折りたたみ可能） */}
                {data.semanticDiffAnalysis && (
                  <details className="mb-6">
                    <summary className="font-bold text-sm mb-2 cursor-pointer hover:text-purple-600">
                      {t("results.detailedAnalysis")}
                    </summary>
                    <div className="mt-4 space-y-4">
                      {data.semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher && (
                        <div>
                          <h4 className="font-semibold text-sm mb-2">{t("results.whyCompetitorsRankHigher")}</h4>
                          <p className="text-sm bg-gray-50 p-3 rounded border">
                            {data.semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher}
                          </p>
                        </div>
                      )}

                      {data.semanticDiffAnalysis.semanticAnalysis.missingContent &&
                        data.semanticDiffAnalysis.semanticAnalysis.missingContent.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2">
                              {t("results.missingContent", { count: data.semanticDiffAnalysis.semanticAnalysis.missingContent.length })}
                            </h4>
                            <ul className="list-disc list-inside space-y-1 bg-gray-50 p-3 rounded border">
                              {data.semanticDiffAnalysis.semanticAnalysis.missingContent.map(
                                (content: string, i: number) => (
                                  <li key={i} className="text-sm">{content}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                      {data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions &&
                        data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length > 0 && (
                          <details>
                            <summary className="font-semibold text-sm mb-2 cursor-pointer hover:text-purple-600">
                              {t("results.recommendedAdditions", { count: data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length })}
                            </summary>
                            <div className="space-y-2 mt-2">
                              {data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.map(
                                (rec: any, i: number) => (
                                  <div key={i} className="bg-yellow-50 p-3 rounded border border-yellow-300">
                                    <p className="font-semibold text-sm">{t("results.sectionLabel", { section: rec.section })}</p>
                                    <p className="text-xs text-gray-600 mt-1">{t("results.reason")}: {rec.reason}</p>
                                    <p className="text-sm mt-2">{rec.content}</p>
                                    {rec.competitorUrls && rec.competitorUrls.length > 0 && (
                                      <div className="mt-3 pt-3 border-t border-yellow-400">
                                        <p className="text-xs font-semibold text-gray-700 mb-2">
                                          {t("results.referenceCompetitorSites")}
                                        </p>
                                        <ul className="list-none space-y-1">
                                          {rec.competitorUrls.map((url: string, j: number) => (
                                            <li key={j}>
                                              <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-600 hover:text-blue-800 underline break-all"
                                              >
                                                {url}
                                              </a>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </details>
                        )}
                    </div>
                  </details>
                )}

                {/* AI SEO対策セクション */}
                {data.aiSEOAnalysis && (
                  <div className="mb-6">
                    <h3 className="font-bold text-lg mb-2 text-gray-800 border-l-4 border-blue-500 pl-3">
                      {t("results.aiSEOOptimization")}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {t("results.aiSEOOptimizationDescription")}
                    </p>
                    {data.aiSEOAnalysis.missingElements.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-700">
                          {t("results.aiSEOMissingElements", { count: data.aiSEOAnalysis.missingElements.length })}
                        </h4>
                        {data.aiSEOAnalysis.missingElements.map((element: any, i: number) => (
                          <div key={i} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-sm text-gray-800">{element.element}</p>
                                <p className="text-xs text-gray-600 mt-1">{element.description}</p>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 mt-2 mb-2">
                              <strong>{t("results.aiSEORecommendations")}:</strong> {element.recommendation}
                            </p>
                            {element.foundIn && element.foundIn.length > 0 && (
                              <details className="mt-3 pt-3 border-t border-blue-300">
                                <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                  {t("results.aiSEOFoundIn")} ({element.foundIn.length}件)
                                </summary>
                                <ul className="mt-2 space-y-1">
                                  {element.foundIn.map((url: string, j: number) => (
                                    <li key={j}>
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline break-all"
                                      >
                                        {url}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <p className="text-sm text-green-800">{t("results.aiSEONoMissingElements")}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* アクションボタン（改善提案セクション内） */}
                {data.semanticDiffAnalysis && analyzedArticleId && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="space-y-3">
                    <button
                      onClick={() => {
                        router.push(`/dashboard/articles?highlight=${analyzedArticleId}`);
                      }}
                      className="w-full bg-purple-600 text-white font-bold py-3 rounded-lg hover:bg-purple-700 transition-all shadow-md"
                    >
                      {t("notification.settings.goToDashboardToSetup")}
                    </button>
                    <p className="text-xs text-gray-600 text-center">
                      {t("notification.settings.goToDashboardToSetupDescription")}
                    </p>
                      <button
                        className="w-full bg-white border-2 border-purple-600 text-purple-600 font-bold py-3 rounded-lg hover:bg-purple-50 transition-all"
                        onClick={() => {
                          const parts: string[] = [];
                          
                          // キーワード固有の分析結果（全キーワードを含む）
                          if (data.semanticDiffAnalysis?.keywordSpecificAnalysis && data.semanticDiffAnalysis.keywordSpecificAnalysis.length > 0) {
                            const keywordText = data.semanticDiffAnalysis.keywordSpecificAnalysis
                              .map((kw: any) => {
                                const sections: string[] = [];
                                sections.push(`## ${kw.keyword}`);
                                
                                // 順位が下がった理由
                                if (kw.whyRankingDropped) {
                                  sections.push(`### 順位が下がった理由\n${kw.whyRankingDropped}`);
                                }
                                
                                // 追加すべき項目
                                if (kw.whatToAdd && kw.whatToAdd.length > 0) {
                                  const items = kw.whatToAdd.map((item: any) => {
                                    const itemText = typeof item === 'string' ? item : item.item;
                                    return `- ${itemText}`;
                                  }).join('\n');
                                  sections.push(`### 追加すべき項目\n${items}`);
                                }
                                
                                return sections.join('\n\n');
                              })
                              .join('\n\n---\n\n');
                            if (keywordText) {
                              parts.push('【キーワード固有の改善提案】');
                              parts.push(keywordText);
                            }
                          }
                          
                          // 詳細な分析結果（semanticAnalysis）
                          if (data.semanticDiffAnalysis?.semanticAnalysis) {
                            const semanticParts: string[] = [];
                            
                            if (data.semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher) {
                              semanticParts.push(`### 競合が上位である理由\n${data.semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher}`);
                            }
                            
                            if (data.semanticDiffAnalysis.semanticAnalysis.missingContent && data.semanticDiffAnalysis.semanticAnalysis.missingContent.length > 0) {
                              const missingContentText = data.semanticDiffAnalysis.semanticAnalysis.missingContent
                                .map((content: string) => `- ${content}`)
                                .join('\n');
                              semanticParts.push(`### 不足しているコンテンツ\n${missingContentText}`);
                            }
                            
                            if (data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions && data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length > 0) {
                              const recommendedText = data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions
                                .map((rec: any) => {
                                  const recParts: string[] = [];
                                  recParts.push(`#### ${rec.section}`);
                                  if (rec.reason) recParts.push(`理由: ${rec.reason}`);
                                  if (rec.content) recParts.push(rec.content);
                                  return recParts.join('\n');
                                })
                                .join('\n\n');
                              semanticParts.push(`### 推奨される追加内容\n${recommendedText}`);
                            }
                            
                            if (semanticParts.length > 0) {
                              parts.push('\n【詳細な分析結果】');
                              parts.push(semanticParts.join('\n\n'));
                            }
                          }
                          
                          // AI SEO対策の結果
                          if (data.aiSEOAnalysis?.missingElements && data.aiSEOAnalysis.missingElements.length > 0) {
                            const aiSEOText = data.aiSEOAnalysis.missingElements
                              .map((element: any) => {
                                return `## ${element.element}\n${element.recommendation}`;
                              })
                              .join('\n\n');
                            if (aiSEOText) {
                              parts.push('\n【AI検索最適化（AIO対応）の改善提案】');
                              parts.push(aiSEOText);
                            }
                          }
                          
                          const text = parts.join('\n\n');
                          if (text) {
                            navigator.clipboard.writeText(text);
                            alert(t("results.copied"));
                          } else {
                            alert(t("results.noContentToCopy"));
                          }
                        }}
                      >
                        {t("results.copyToClipboard")}
                      </button>
                    </div>
                  </div>
                )}


              </div>
            </div>

              {/* 競合URLセクション（右列内） */}
              {data.competitorResults && data.competitorResults.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg border p-6">
                  <h3 className="font-bold text-lg mb-4 text-gray-800 border-l-4 border-blue-500 pl-3">
                    {t("results.competitorUrlsPerKeyword")}
                  </h3>
                  <div className="space-y-4">
                    {data.competitorResults.map((result: any, index: number) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="mb-3">
                          <p className="font-semibold text-sm mb-1">{t("results.keyword")}: {result.keyword}</p>
                          <div className="text-xs text-gray-600">
                            <span>{t("results.ownUrlRank")}: {result.ownPosition ? `${typeof result.ownPosition === 'number' ? formatPosition(result.ownPosition) : result.ownPosition}${t("results.rankSuffix")}` : t("results.unknown")}</span>
                            <span className="ml-4">{t("results.competitorUrlCount")}: {result.competitors.length}{t("results.items")}</span>
                          </div>
                          {result.error && (
                            <p className="text-xs text-red-600 mt-1">⚠️ {result.error}</p>
                          )}
                        </div>
                        {result.competitors && result.competitors.length > 0 && (
                          <div className="space-y-2">
                            {result.competitors.map((comp: any, compIndex: number) => (
                              <div
                                key={compIndex}
                                className="bg-white p-2 rounded border border-gray-200 hover:border-blue-400 transition-colors"
                              >
                                <div className="flex items-start justify-between">
                                  <a
                                    href={comp.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 underline break-all flex-1"
                                  >
                                    {comp.url}
                                  </a>
                                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                                    {typeof comp.position === 'number' ? formatPosition(comp.position) : comp.position}{t("results.rankSuffix")}
                                  </span>
                                </div>
                                {comp.title && (
                                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{comp.title}</p>
                                )}
                </div>
                            ))}
              </div>
                        )}
                      </div>
                    ))}
            </div>
                </div>
              )}
            </div>
          </div>
          )}
          </div>
          ) : (
          /* 記事提案タブ */
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {t("home.newArticleSuggestion") || "新規記事提案"}
            </h2>
            <p className="text-gray-600 mb-6">
              {t("home.suggestArticleDescription")}
            </p>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    {t("home.suggestArticleNote") || "注意: Search Consoleからキーワードデータを取得できない場合（インプレッションやクリックがない場合）、新規記事の提案ができない場合があります。"}
                  </p>
                </div>
              </div>
            </div>

            {/* ドメイン入力フィールド */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {t("home.siteUrlOrDomain") || "サイトURLまたはドメイン"}
              </label>
              <input
                type="text"
                value={suggestionSiteUrl || selectedSiteUrl || ""}
                onChange={(e) => setSuggestionSiteUrl(e.target.value)}
                placeholder="https://example.com または example.com"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t("home.siteUrlOrDomainHint") || "記事URLまたはドメインを入力してください。ドメインを入力した場合、そのドメイン全体のキーワードから提案を生成します。"}
              </p>
            </div>

            {/* 提案生成ボタン */}
            <div className="mb-6">
              <button
                onClick={async () => {
                  const inputUrl = suggestionSiteUrl || selectedSiteUrl;
                  if (!inputUrl) {
                    setError("サイトURLまたはドメインを入力してください");
                    return;
                  }

                    setGeneratingSuggestions(true);
                    setError(null);
                    try {
                      // 入力されたURL/ドメインからサイトを取得または作成
                      let siteId = selectedSiteId;
                      
                      // まず、入力されたURL/ドメインに一致するサイトを探す
                      const sitesResponse = await fetch("/api/sites");
                      if (sitesResponse.ok) {
                        const sites = await sitesResponse.json();
                        // URLを正規化して比較
                        const normalizedInput = inputUrl.trim().replace(/\/$/, "");
                        const site = sites.find((s: any) => {
                          const normalizedSiteUrl = s.site_url?.trim().replace(/\/$/, "");
                          return normalizedSiteUrl === normalizedInput || 
                                 normalizedSiteUrl === `sc-domain:${normalizedInput.replace(/^https?:\/\//, "").replace(/^www\./, "")}` ||
                                 normalizedInput.replace(/^https?:\/\//, "").replace(/^www\./, "") === normalizedSiteUrl?.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/^www\./, "");
                        });
                        
                        if (site) {
                          siteId = site.id;
                          setSelectedSiteId(site.id);
                        } else {
                          // サイトが存在しない場合は、新規作成を試みる
                          const saveResponse = await fetch("/api/sites/save", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              siteUrl: normalizedInput,
                              displayName: normalizedInput,
                            }),
                          });
                          
                          if (saveResponse.ok) {
                            const saveResult = await saveResponse.json();
                            if (saveResult.site?.id) {
                              siteId = saveResult.site.id;
                              setSelectedSiteId(saveResult.site.id);
                            }
                          }
                        }
                      }

                      if (!siteId) {
                        throw new Error("サイトの取得または作成に失敗しました");
                      }

                      const response = await fetch("/api/article-suggestions/generate", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          siteId: siteId,
                        }),
                      });

                      if (!response.ok) {
                        const errorData = await response.json();
                        // 特別なエラーメッセージを処理
                        if (errorData.error === "NO_KEYWORDS_FOUND") {
                          throw new Error("NO_KEYWORDS_FOUND");
                        } else if (errorData.error === "NO_GAP_KEYWORDS_FOUND") {
                          throw new Error("NO_GAP_KEYWORDS_FOUND");
                        }
                        throw new Error(errorData.error || errorData.message || t("errors.suggestionGenerationFailed"));
                      }

                      const result = await response.json();
                      setSuggestions(result.suggestions || []);
                      
                      // 提案一覧を再読み込み
                      loadSuggestions(siteId);
                    } catch (err: any) {
                      console.error("Error generating suggestions:", err);
                      // 特別なエラーメッセージを処理
                      if (err.message === "NO_KEYWORDS_FOUND") {
                        setError(t("errors.noKeywordsFound") || "Search Consoleからキーワードデータを取得できませんでした。このサイトにはまだインプレッションやクリックがない可能性があります。");
                      } else if (err.message === "NO_GAP_KEYWORDS_FOUND") {
                        setError(t("errors.noGapKeywordsFound") || "新規記事として提案できるキーワードが見つかりませんでした。既存の記事で十分にカバーされているか、インプレッション数が少ない可能性があります。");
                      } else {
                        setError(err.message || t("errors.suggestionGenerationFailed"));
                      }
                    } finally {
                      setGeneratingSuggestions(false);
                    }
                  }}
                  disabled={generatingSuggestions || !(suggestionSiteUrl || selectedSiteUrl)}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-4 rounded-lg hover:opacity-90 transition-all shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingSuggestions ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      <span>{t("home.generatingSuggestions")}</span>
                    </>
                  ) : (
                    <span>{t("home.generateSuggestions")}</span>
                  )}
              </button>
            </div>

            {/* 提案一覧 */}
            {(suggestionSiteUrl || selectedSiteUrl) && (
              <div className="mt-6">
                {loadingSuggestions ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                    <p className="mt-2 text-sm text-gray-600">{t("home.loadingSuggestions")}</p>
                  </div>
                ) : suggestions.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {t("home.suggestionsList")} ({t("home.suggestionsCount", { count: suggestions.length })})
                    </h3>
                    {suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        onClick={() => {
                          // 記事のsite_idをURLパラメータとして渡す（site_id形式で統一）
                          const siteId = suggestion.site_id || selectedSiteId;
                          if (siteId) {
                            router.push(`/dashboard/article-suggestions?site_id=${siteId}`);
                          } else {
                            router.push("/dashboard/article-suggestions");
                          }
                        }}
                        className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-gray-900 mb-2">
                              {suggestion.title}
                            </h4>
                            {suggestion.keywords && suggestion.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {suggestion.keywords.slice(0, 5).map((keyword: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                                {suggestion.keywords.length > 5 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                    +{suggestion.keywords.length - 5}
                                  </span>
                                )}
                              </div>
                            )}
                            {suggestion.reason && (
                              <p className="text-sm text-gray-600 mb-2">{suggestion.reason}</p>
                            )}
                            {suggestion.estimated_impressions && (
                              <p className="text-xs text-gray-500">
                                {t("home.estimatedImpressions")}: {suggestion.estimated_impressions.toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div className="ml-4 flex flex-col gap-2">
                            {suggestion.status === "completed" && (
                              <span className="px-3 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">
                                {t("home.status.completed")}
                              </span>
                            )}
                            {suggestion.status === "skipped" && (
                              <span className="px-3 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">
                                {t("home.status.skipped")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <p className="text-gray-600">
                      {t("home.noSuggestions")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
