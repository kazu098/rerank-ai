"use client";

import { useState, useEffect, useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/src/i18n/routing";
import { KeywordTimeSeriesChart } from "@/components/landing/KeywordTimeSeriesChart";

// 順位をフォーマット（整数の場合は整数表示、小数がある場合は少数第2位まで）
function formatPosition(position: number | string): string {
  if (typeof position !== 'number') return String(position);
  return Number.isInteger(position) ? position.toFixed(0) : position.toFixed(2);
}

export function AuthenticatedContent() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<{
    message: string;
    limitType: string;
    currentUsage: number;
    limit: number | null;
  } | null>(null);
  const [articleUrl, setArticleUrl] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [maxKeywords, setMaxKeywords] = useState(3);
  const [maxCompetitorsPerKeyword, setMaxCompetitorsPerKeyword] = useState(3);
  
  // キーワード手動選択関連
  const [showKeywordSelectModal, setShowKeywordSelectModal] = useState(false);
  const [keywords, setKeywords] = useState<Array<{ keyword: string; position: number; impressions: number; clicks: number; ctr: number }>>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  
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
  const [debouncedArticleSearchQuery, setDebouncedArticleSearchQuery] = useState("");
  const [fetchingTitleUrls, setFetchingTitleUrls] = useState<Set<string>>(new Set());
  const [articlePage, setArticlePage] = useState(1);
  const articlesPerPage = 50;

  // 検索クエリのデバウンス（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedArticleSearchQuery(articleSearchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [articleSearchQuery]);

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
    if (propertiesLoaded) return;
    setLoadingProperties(true);
    setError(null);
    try {
      const response = await fetch("/api/gsc/properties");
      
      if (response.ok) {
        const result = await response.json();
        setGscProperties(result.properties || []);
        setPropertiesLoaded(true);
        if (result.properties && result.properties.length > 0) {
          setShowPropertySelection(true);
        }
      } else {
        const error = await response.json();
        if (error.code === "TOKEN_EXPIRED" || error.code === "INSUFFICIENT_SCOPES" || response.status === 401 || response.status === 403) {
          // 認証トークンの期限切れまたはスコープ不足の場合は再ログインを促す
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
      setSelectedSiteUrl(siteUrl);
      setShowPropertySelection(false);
      
      if (result.site?.id) {
        setSelectedSiteId(result.site.id);
      }
      
      localStorage.setItem("selectedGSCSiteUrl", siteUrl);
      loadArticles(siteUrl);
    } catch (err: any) {
      console.error("[GSC] Error saving site:", err);
      setError(err.message || t("errors.propertySaveFailed"));
    }
  };

  const loadArticles = async (siteUrl: string, page: number = 1) => {
    setLoadingArticles(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/list?siteUrl=${encodeURIComponent(siteUrl)}&page=${page}&pageSize=50`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("errors.articleListLoadFailed"));
      }

      const result = await response.json();
      // ページ1の場合は置き換え、それ以外は追加（無限スクロール的な動作）
      if (page === 1) {
        setArticles(result.articles || []);
      } else {
        setArticles((prev) => [...prev, ...(result.articles || [])]);
      }
      setShowArticleSelection(true);
      setArticlePage(page);
    } catch (err: any) {
      console.error("[Articles] Error loading articles:", err);
      setError(err.message || t("errors.articleListLoadFailed"));
    } finally {
      setLoadingArticles(false);
    }
  };

  const fetchArticleTitle = async (url: string, siteUrl: string) => {
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
        // 404エラーの場合、エラーをスローせずにログだけ記録（他の記事の処理を続行できるように）
        if (response.status === 404 || errorData.code === "ARTICLE_NOT_FOUND") {
          console.warn(`[Articles] Article not found (404): ${errorData.url || url}`);
          return; // エラーをスローせずに終了
        }
        throw new Error(errorData.error || t("errors.titleFetchFailed"));
      }

      const result = await response.json();
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

  useEffect(() => {
    if (status === "authenticated" && session?.accessToken && !selectedSiteUrl && !loadingProperties && !propertiesLoaded) {
      loadGSCProperties();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.accessToken, selectedSiteUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const siteIdParam = params.get("siteId");
      const tabParam = params.get("tab");
      const articleUrlParam = params.get("articleUrl");
      
      if (tabParam === "suggestion") {
        setActiveTab("suggestion");
      }
      
      // 記事URLパラメータがある場合、記事URLを設定（analyze=trueの処理は別のuseEffectで行う）
      if (articleUrlParam && status === "authenticated") {
        const decodedUrl = decodeURIComponent(articleUrlParam);
        setArticleUrl(decodedUrl);
        
        // サイトURLを抽出して設定
        try {
          const urlObj = new URL(decodedUrl);
          const siteUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          
          // 既に選択されているサイトURLと一致しない場合は、サイトを保存して選択
          if (!selectedSiteUrl || (selectedSiteUrl.replace(/\/$/, "") !== siteUrl && selectedSiteUrl.replace(/\/$/, "") !== siteUrl + "/")) {
            fetch("/api/sites/save", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                siteUrl: siteUrl,
                displayName: siteUrl,
              }),
            })
              .then(async (res) => {
                const result = await res.json();
                if (res.ok) {
                  setSelectedSiteUrl(siteUrl);
                  if (result.site?.id) {
                    setSelectedSiteId(result.site.id);
                  }
                }
              })
              .catch((err) => console.error("Error saving site:", err));
          }
        } catch (err) {
          console.error("Error parsing article URL:", err);
        }
      }
      
      if (siteIdParam && status === "authenticated") {
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
  }, [status, selectedSiteUrl]);

  useEffect(() => {
    if (selectedSiteUrl) {
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

  // articleUrlとselectedSiteUrlが設定された後、analyze=trueの場合は自動分析を開始
  useEffect(() => {
    if (typeof window !== "undefined" && status === "authenticated" && articleUrl && selectedSiteUrl) {
      const params = new URLSearchParams(window.location.search);
      const analyzeParam = params.get("analyze");
      
      if (analyzeParam === "true") {
        // URLからクエリパラメータを削除
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("articleUrl");
        currentUrl.searchParams.delete("analyze");
        window.history.replaceState({}, "", currentUrl.toString());
        
        // 少し遅延させてから分析を開始（状態が更新されるのを待つ）
        const timer = setTimeout(() => {
          startAnalysis();
        }, 500);
        
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, articleUrl, selectedSiteUrl]);

  useEffect(() => {
    if (status === "authenticated" && session?.accessToken && session?.userId) {
      const savedSiteUrl = localStorage.getItem("selectedGSCSiteUrl");
      if (savedSiteUrl && !selectedSiteUrl) {
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
              if (result.site?.id) {
                setSelectedSiteId(result.site.id);
              }
              loadArticles(savedSiteUrl);
            } else {
              const error = await response.json();
              console.error("[GSC] Failed to save site from localStorage:", error);
              localStorage.removeItem("selectedGSCSiteUrl");
              setShowPropertySelection(true);
            }
          } catch (err: any) {
            console.error("[GSC] Error saving site from localStorage:", err);
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
              setData(latestAnalysisData.analysisResult);
              setCompletedSteps(new Set([1, 2, 3, 4, 5, 6, 7]));
              setCurrentStep(0);
              setLoading(false);
              if (latestAnalysisData.articleId) {
                setAnalyzedArticleId(latestAnalysisData.articleId);
              }
              return;
            }
          }
        }
      }
    } catch (checkError: any) {
      console.error("[Analysis] Error checking recent analysis:", checkError);
    }

    setLoading(true);
    setError(null);
    setData(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    
    const analysisStartTime = Date.now();

    try {
      const urlObj = new URL(articleUrl);
      const siteUrl = selectedSiteUrl.replace(/\/$/, "");
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
      
      setCurrentStep(1);
      
      // 手動選択されたキーワードがある場合はそれを使用、ない場合は自動選定
      const selectedKeywordsArray = selectedKeywords.size > 0 
        ? Array.from(selectedKeywords).map(kw => {
            const keywordData = keywords.find(k => k.keyword === kw);
            return keywordData ? {
              keyword: keywordData.keyword,
              position: keywordData.position,
              impressions: keywordData.impressions,
              clicks: keywordData.clicks,
              ctr: keywordData.ctr,
            } : null;
          }).filter(Boolean) as Array<{ keyword: string; position: number; impressions: number; clicks: number; ctr: number }>
        : undefined;
      
      const step1Response = await fetch("/api/competitors/analyze-step1", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({
          siteUrl,
          pageUrl,
          maxKeywords: selectedKeywordsArray ? selectedKeywordsArray.length : maxKeywords,
          selectedKeywords: selectedKeywordsArray,
        }),
      });

      if (!step1Response.ok) {
        const errorData = await step1Response.json();
        if (errorData.limitExceeded || errorData.upgradeRequired) {
          const errorKey = errorData.errorKey || errorData.error || "errors.limitExceeded";
          const limitTypeKey = errorData.limitType 
            ? `errors.limitType${errorData.limitType.charAt(0).toUpperCase() + errorData.limitType.slice(1)}`
            : "";
          const limitTypeLabel = limitTypeKey ? t(limitTypeKey) : errorData.limitType || "";
          const errorMessage = t(errorKey, {
            limitType: limitTypeLabel,
            limit: errorData.limit || ""
          });
          const error = new Error(errorMessage);
          (error as any).limitExceeded = true;
          (error as any).limitType = errorData.limitType;
          (error as any).currentUsage = errorData.currentUsage;
          (error as any).limit = errorData.limit;
          (error as any).errorKey = errorKey;
          throw error;
        }
        const errorKey = errorData.errorKey || errorData.error;
        throw new Error(errorKey ? t(errorKey) : errorData.error || "Step 1に失敗しました");
      }

      const step1Result = await step1Response.json();
      let currentAnalysisResult = {
        ...step1Result,
        competitorResults: [],
        uniqueCompetitorUrls: [],
      };
      setData(currentAnalysisResult);
      setCompletedSteps(prev => new Set([1, 2, 3]));
      setCurrentStep(4);

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
      
      if (step2Result.competitorResults && currentAnalysisResult?.keywordTimeSeries) {
        const updatedTimeSeries = currentAnalysisResult.keywordTimeSeries.map((kwSeries: any) => {
          const competitorResult = step2Result.competitorResults.find(
            (cr: any) => cr.keyword === kwSeries.keyword
          );
          
          const isNotFoundInSerper = competitorResult && !competitorResult.ownPosition;
          
          if (isNotFoundInSerper && kwSeries.metadata) {
            return {
              ...kwSeries,
              metadata: {
                ...kwSeries.metadata,
                hasRecentDrop: true,
                serperApiNotFound: true,
              }
            };
          }
          return kwSeries;
        });
        
        currentAnalysisResult = {
          ...currentAnalysisResult,
          ...step2Result,
          keywordTimeSeries: updatedTimeSeries,
        };
        setData(currentAnalysisResult);
      } else {
        currentAnalysisResult = {
          ...currentAnalysisResult,
          ...step2Result,
        };
        setData(currentAnalysisResult);
      }
      setCompletedSteps(prev => new Set(prev).add(4));
      setCurrentStep(5);

      if (step2Result.uniqueCompetitorUrls.length > 0) {
        setCompletedSteps(prev => new Set(prev).add(5));
        setCurrentStep(6);
        
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
          let errorData: any;
          try {
            errorData = await step3Response.json();
          } catch (jsonError) {
            // JSONパースに失敗した場合（タイムアウトなどでプレーンテキストが返される場合）
            const errorText = await step3Response.text();
            console.error("Step 3 failed (non-JSON response):", errorText);
            errorData = {
              error: step3Response.status === 504
                ? "処理がタイムアウトしました。分析に時間がかかりすぎています。"
                : `Step 3に失敗しました (${step3Response.status})`,
              timeout: step3Response.status === 504,
            };
          }
          console.error("Step 3 failed:", errorData);
          setCompletedSteps(prev => new Set([...Array.from(prev), 5, 6, 7]));
          setCurrentStep(0);
        } else {
          const step3Result = await step3Response.json();
          currentAnalysisResult = {
            ...currentAnalysisResult,
            ...step3Result,
          };
          setData(currentAnalysisResult);
          setCompletedSteps(prev => new Set([...Array.from(prev), 6, 7]));
          setCurrentStep(0);
        }
      } else {
        setCompletedSteps(prev => new Set([...Array.from(prev), 5, 6, 7]));
        setCurrentStep(0);
      }

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
            if (saveResult.articleId) {
              setAnalyzedArticleId(saveResult.articleId);
            }
          } else {
            const errorData = await saveResponse.json();
            console.error("[Analysis] Failed to save to database:", errorData);
          }
        } catch (saveError: any) {
          console.error("[Analysis] Error saving to database:", saveError);
        }
      }
      
      // 手動選択されたキーワードをクリア
      setSelectedKeywords(new Set());
    } catch (err: any) {
      if (err.limitExceeded) {
        setLimitError({
          message: err.message,
          limitType: err.limitType || "unknown",
          currentUsage: err.currentUsage || 0,
          limit: err.limit || null,
        });
        setError(null);
      } else {
        setError(err.message);
        setLimitError(null);
      }
      setCurrentStep(0);
      setCompletedSteps(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleOpenKeywordSelectModal = async () => {
    if (!selectedSiteUrl || !articleUrl) return;
    
    setShowKeywordSelectModal(true);
    setLoadingKeywords(true);
    setSelectedKeywords(new Set());
    
    try {
      const siteUrl = selectedSiteUrl.replace(/\/$/, "");
      const urlObj = new URL(articleUrl);
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
      
      // GSCデータからキーワード一覧を取得
      const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const startDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      
      const keywordsResponse = await fetch(
        `/api/gsc/keywords?siteUrl=${encodeURIComponent(siteUrl)}&pageUrl=${encodeURIComponent(pageUrl)}&startDate=${startDate}&endDate=${endDate}`
      );
      
      if (!keywordsResponse.ok) {
        throw new Error("キーワードデータの取得に失敗しました");
      }
      
      const keywordsData = await keywordsResponse.json();
      const keywordList = (keywordsData.rows || []).map((row: any) => ({
        keyword: row.keys[0],
        position: row.position,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
      })).filter((kw: any) => kw.impressions >= 1); // インプレッション1以上を表示
      
      // インプレッション数でソート（降順）
      keywordList.sort((a: any, b: any) => b.impressions - a.impressions);
      
      setKeywords(keywordList);
    } catch (err: any) {
      console.error("[Keyword Select] Error:", err);
      setError(err.message || "キーワードデータの取得に失敗しました");
    } finally {
      setLoadingKeywords(false);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-4xl mx-auto">
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
                                setArticlePage(1);
                              }}
                              placeholder={t("article.searchPlaceholder")}
                              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                            />
                          </div>

                          {/* 記事一覧 */}
                          <div className="space-y-2">
                            {(() => {
                              const filteredArticles = articles.filter((article) => {
                                if (!debouncedArticleSearchQuery) return true;
                                const query = debouncedArticleSearchQuery.toLowerCase();
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
                              if (!debouncedArticleSearchQuery) return true;
                              const query = debouncedArticleSearchQuery.toLowerCase();
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
                        {t("dashboard.articles.selectKeywords")}
                      </label>
                      <button
                        onClick={handleOpenKeywordSelectModal}
                        disabled={loading || !articleUrl || !selectedSiteUrl}
                        className="w-full px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed"
                      >
                        {t("dashboard.articles.selectKeywords")}
                      </button>
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
                {(error || limitError) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
                    <p className="text-red-800 font-semibold">{t("common.error")}</p>
                    {limitError ? (
                      <div>
                        <p className="text-yellow-800 font-semibold mb-2">{limitError.message}</p>
                        <p className="text-yellow-700 text-sm mb-3">
                          {t("billing.currentUsage")}: {t("billing.usage", {
                            current: limitError.currentUsage,
                            limit: limitError.limit ?? t("billing.unlimited")
                          })}
                        </p>
                        <Link
                          href="/#pricing"
                          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          {t("billing.upgradePlan")}
                        </Link>
                      </div>
                    ) : (
                      <p className="text-red-600">{error}</p>
                    )}
                  </div>
                )}

                {/* 結果表示エリア - 2列レイアウト */}
                {data && (
                  <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                                    
                                    if (data.semanticDiffAnalysis?.keywordSpecificAnalysis && data.semanticDiffAnalysis.keywordSpecificAnalysis.length > 0) {
                                      const keywordText = data.semanticDiffAnalysis.keywordSpecificAnalysis
                                        .map((kw: any) => {
                                          const sections: string[] = [];
                                          sections.push(`## ${kw.keyword}`);
                                          
                                          if (kw.whyRankingDropped) {
                                            sections.push(`### 順位が下がった理由\n${kw.whyRankingDropped}`);
                                          }
                                          
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
                        let siteId = selectedSiteId;
                        
                        const sitesResponse = await fetch("/api/sites");
                        if (sitesResponse.ok) {
                          const sites = await sitesResponse.json();
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
                          if (errorData.error === "NO_KEYWORDS_FOUND") {
                            throw new Error("NO_KEYWORDS_FOUND");
                          } else if (errorData.error === "NO_GAP_KEYWORDS_FOUND") {
                            throw new Error("NO_GAP_KEYWORDS_FOUND");
                          }
                          throw new Error(errorData.error || errorData.message || t("errors.suggestionGenerationFailed"));
                        }

                        const result = await response.json();
                        setSuggestions(result.suggestions || []);
                        loadSuggestions(siteId);
                      } catch (err: any) {
                        console.error("Error generating suggestions:", err);
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

      {/* キーワード選択モーダル */}
      {showKeywordSelectModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowKeywordSelectModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {t("dashboard.articles.keywordSelect.title")}
                </h2>
                <button
                  onClick={() => setShowKeywordSelectModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                {t("dashboard.articles.keywordSelect.description")}
              </p>
              
              {loadingKeywords ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">{t("dashboard.articles.keywordSelect.loading")}</p>
                </div>
              ) : keywords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {t("dashboard.articles.keywordSelect.noKeywords")}
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {t("dashboard.articles.keywordSelect.selectedCount", { count: selectedKeywords.size, max: maxKeywords })}
                      </span>
                      {selectedKeywords.size > 0 && (
                        <button
                          onClick={() => setSelectedKeywords(new Set())}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {t("dashboard.articles.keywordSelect.clearAll")}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.select")}
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.keyword")}
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.position")}
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.impressions")}
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            {t("dashboard.articles.keywordSelect.clicks")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {keywords.map((kw, index) => {
                          const isSelected = selectedKeywords.has(kw.keyword);
                          const isDisabled = !isSelected && selectedKeywords.size >= maxKeywords;
                          
                          return (
                            <tr
                              key={index}
                              className={`hover:bg-gray-50 ${isDisabled ? "opacity-50" : ""}`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isDisabled}
                                  onChange={() => {
                                    const newSelected = new Set(selectedKeywords);
                                    if (isSelected) {
                                      newSelected.delete(kw.keyword);
                                    } else if (newSelected.size < maxKeywords) {
                                      newSelected.add(kw.keyword);
                                    }
                                    setSelectedKeywords(newSelected);
                                  }}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {kw.keyword}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {kw.position.toFixed(1)}位
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {kw.impressions.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {kw.clicks.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowKeywordSelectModal(false);
                        setSelectedKeywords(new Set());
                      }}
                      className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={() => {
                        if (selectedKeywords.size > 0) {
                          setShowKeywordSelectModal(false);
                          startAnalysis();
                        }
                      }}
                      disabled={selectedKeywords.size === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                      {t("dashboard.articles.keywordSelect.startAnalysis")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}