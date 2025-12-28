"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/src/i18n/routing";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// 分析モードは統一（タブを削除）

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
  const [showMonitoringDialog, setShowMonitoringDialog] = useState(false);
  const [monitoringEmail, setMonitoringEmail] = useState("");
  const [monitoringTime, setMonitoringTime] = useState("09:00");
  const [savingMonitoring, setSavingMonitoring] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [enableEmailNotification, setEnableEmailNotification] = useState(true);
  const [enableSlackNotification, setEnableSlackNotification] = useState(false);


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

  // Slack連携状態を取得
  const fetchSlackConnectionStatus = async () => {
    try {
      const response = await fetch("/api/notification-settings");
      if (response.ok) {
        const data = await response.json();
        setSlackConnected(!!data?.slack_bot_token);
      }
    } catch (err) {
      console.error("[Monitoring] Error fetching Slack status:", err);
    }
  };

  // GSCプロパティ一覧を取得
  useEffect(() => {
    if (status === "authenticated" && session?.accessToken && !selectedSiteUrl && !loadingProperties && !propertiesLoaded) {
      loadGSCProperties();
      fetchSlackConnectionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.accessToken, selectedSiteUrl]);

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
    setLoading(true);
    setError(null);
    setData(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    
    const analysisStartTime = Date.now();

    if (!selectedSiteUrl) {
      setError(t("errors.propertyNotSelected"));
      setLoading(false);
      return;
    }

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
                <Link href={`/${locale}`} className="text-2xl font-bold text-gray-900">
                  ReRank AI
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
              <p className="text-base md:text-lg text-gray-600 mb-6 whitespace-nowrap">
                {t("home.heroSubtitle")}
              </p>
            </div>

            {/* 簡単な説明 */}
            <div className="max-w-2xl mx-auto mb-6">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                <p className="text-sm text-blue-700">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
              ReRank AI <span className="text-sm font-normal text-white bg-purple-600 px-2 py-1 rounded">MVP</span>
            </h1>
            <div className="flex items-center gap-4">
              <Link
                href={`/${locale}/dashboard`}
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
                                    <p className="font-semibold text-sm text-gray-900 mb-1 line-clamp-1">
                                      {article.title}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                      {article.url}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-700 truncate">
                                    {article.url}
                                  </p>
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
        </div>
        )}

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

                {/* アクションボタン（改善提案セクション内） */}
                {data.semanticDiffAnalysis && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="space-y-3">
                    <button
                      onClick={async () => {
                        setMonitoringEmail(session?.user?.email || "");
                        setEnableEmailNotification(true);
                        setEnableSlackNotification(false);
                        // ダイアログを開く前にSlack連携状態を取得
                        await fetchSlackConnectionStatus();
                        setShowMonitoringDialog(true);
                      }}
                      className="w-full bg-purple-600 text-white font-bold py-3 rounded-lg hover:bg-purple-700 transition-all shadow-md"
                    >
                      {t("notification.settings.startMonitoring")}
                    </button>
                      <button
                        className="w-full bg-white border-2 border-purple-600 text-purple-600 font-bold py-3 rounded-lg hover:bg-purple-50 transition-all"
                        onClick={() => {
                          const text = data.semanticDiffAnalysis?.keywordSpecificAnalysis
                            ?.map((kw: any) => {
                              const items = kw.whatToAdd?.map((item: any) => {
                                const itemText = typeof item === 'string' ? item : item.item;
                                return `- ${itemText}`;
                              }).join('\n') || '';
                              return `## ${kw.keyword}\n${items}`;
                            })
                            .join('\n\n') || '';
                          navigator.clipboard.writeText(text);
                          alert(t("results.copied"));
                        }}
                      >
                        {t("results.copyToClipboard")}
                      </button>
                    </div>
                  </div>
                )}

                {/* 監視開始ダイアログ */}
                {showMonitoringDialog && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
                      <h3 className="text-xl font-bold mb-4">{t("notification.settings.startMonitoring")}</h3>
                      <p className="text-sm text-gray-600 mb-6">{t("notification.settings.startMonitoringDescription")}</p>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="flex items-center space-x-2 mb-2">
                            <input
                              type="checkbox"
                              checked={enableEmailNotification}
                              onChange={(e) => setEnableEmailNotification(e.target.checked)}
                              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                            <span className="text-sm font-semibold">{t("notification.settings.emailNotification")}</span>
                          </label>
                          {enableEmailNotification && (
                            <input
                              type="email"
                              value={monitoringEmail}
                              onChange={(e) => setMonitoringEmail(e.target.value)}
                              placeholder={session?.user?.email || "your-email@example.com"}
                              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none mt-2"
                            />
                          )}
                        </div>

                        <div>
                          <label className="flex items-center space-x-2 mb-2">
                            <input
                              type="checkbox"
                              checked={enableSlackNotification}
                              onChange={(e) => setEnableSlackNotification(e.target.checked)}
                              disabled={!slackConnected}
                              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <span className="text-sm font-semibold">{t("notification.settings.slackNotification")}</span>
                          </label>
                          {!slackConnected && (
                            <p className="text-xs text-gray-500 mt-1">
                              <a 
                                href={`/${locale}/dashboard/notifications`} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 hover:underline"
                              >
                                {t("notification.settings.connectSlack")}
                              </a>
                              {" "}{t("notification.settings.slackConnectionRequired")}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-semibold mb-2">
                            {t("notification.settings.notificationTime")}
                          </label>
                          <input
                            type="time"
                            value={monitoringTime}
                            onChange={(e) => setMonitoringTime(e.target.value)}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                          />
                          <p className="text-xs text-gray-500 mt-1">{t("notification.settings.notificationTimeDescription")}</p>
                        </div>
                      </div>

                      <div className="flex space-x-3 mt-6">
                        <button
                          onClick={async () => {
                            if (enableEmailNotification && !monitoringEmail && !session?.user?.email) {
                              alert(t("notification.settings.emailAddressRequired"));
                              return;
                            }

                            if (!enableEmailNotification && !enableSlackNotification) {
                              alert(t("notification.settings.notificationRequired"));
                              return;
                            }

                            // Slack通知が選択されているが、Slack連携がされていない場合は連携画面に遷移
                            if (enableSlackNotification && !slackConnected) {
                              if (confirm(t("notification.settings.slackConnectionRequiredForNotification"))) {
                                router.push(`/${locale}/dashboard/notifications`);
                              }
                              return;
                            }

                            setSavingMonitoring(true);
                            try {
                              const response = await fetch('/api/articles/start-monitoring', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  url: articleUrl,
                                  siteUrl: selectedSiteUrl,
                                  email: enableEmailNotification ? (monitoringEmail || session?.user?.email) : null,
                                  enableSlack: enableSlackNotification && slackConnected,
                                  notificationTime: `${monitoringTime}:00`,
                                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                }),
                              });

                              if (response.ok) {
                                alert(t("notification.settings.saved"));
                                setShowMonitoringDialog(false);
                              } else {
                                const error = await response.json();
                                alert(error.error || t("notification.settings.error"));
                              }
                            } catch (error: any) {
                              console.error("[Monitoring] Error:", error);
                              alert(t("notification.settings.error"));
                            } finally {
                              setSavingMonitoring(false);
                            }
                          }}
                          disabled={savingMonitoring}
                          className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          {savingMonitoring ? t("notification.settings.saving") : t("notification.settings.startMonitoringButton")}
                        </button>
                        <button
                          onClick={() => setShowMonitoringDialog(false)}
                          disabled={savingMonitoring}
                          className="flex-1 bg-gray-200 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-300 transition-all disabled:opacity-50"
                        >
                          {t("notification.settings.skipButton")}
                        </button>
                      </div>
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
    </div>
  );
}
