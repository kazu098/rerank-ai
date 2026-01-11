import { ArticleScraper } from "./article-scraper";
import { DiffAnalyzer, type DiffAnalysisResult } from "./diff-analyzer";
import { LLMDiffAnalyzer, type LLMDiffAnalysisResult } from "./llm-diff-analyzer";
import { AISEOAnalyzer, type AISEOAnalysisResult } from "./ai-seo-analyzer";
import type { Step1Result, Step2Result, Step3Result } from "./competitor-analysis";
import { getErrorMessage } from "./api-helpers";

/**
 * Step 3: 記事スクレイピング + LLM分析
 */
export async function analyzeStep3(
  siteUrl: string,
  pageUrl: string,
  prioritizedKeywords: Step1Result["prioritizedKeywords"],
  competitorResults: Step2Result["competitorResults"],
  uniqueCompetitorUrls: Step2Result["uniqueCompetitorUrls"],
  skipLLMAnalysis: boolean = false,
  locale: string = "ja"
): Promise<Step3Result> {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 58000; // 58秒（60秒タイムアウトの前に安全に終了）
  console.log(`[CompetitorAnalysis] ⏱️ Step 3 starting at ${new Date().toISOString()}`);
  
  // タイムアウトチェック関数
  const checkTimeout = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_EXECUTION_TIME) {
      throw new Error(getErrorMessage(locale, "errors.timeoutApproaching", { seconds: (elapsed / 1000).toFixed(1) }));
    }
  };

  const articleScraper = new ArticleScraper();
  const diffAnalyzer = new DiffAnalyzer();
  const llmDiffAnalyzer = new LLMDiffAnalyzer();
  const aiSEOAnalyzer = new AISEOAnalyzer();

  let diffAnalysis: DiffAnalysisResult | undefined;
  let semanticDiffAnalysis: LLMDiffAnalysisResult | undefined;
  let aiSEOAnalysis: AISEOAnalysisResult | undefined;

  // 差分分析を実行（競合URLが取得できた場合）
  if (uniqueCompetitorUrls.length > 0 && competitorResults.length > 0) {
    try {
      console.log(
        `[CompetitorAnalysis] Starting diff analysis for ${siteUrl}${pageUrl}`
      );
      // sc-domain:形式の場合はhttps://形式に変換
      let ownUrl: string;
      if (siteUrl.startsWith("sc-domain:")) {
        const domain = siteUrl.replace("sc-domain:", "");
        ownUrl = `https://${domain}${pageUrl}`;
      } else {
        // URLプロパティの場合、末尾のスラッシュを削除して結合
        const siteUrlWithoutSlash = siteUrl.replace(/\/$/, "");
        ownUrl = `${siteUrlWithoutSlash}${pageUrl}`;
      }
      const competitorUrls = uniqueCompetitorUrls.slice(0, 3); // 上位3サイトまで

      // 自社記事と競合記事を並列で取得（処理時間を短縮）
      const [ownArticle, ...competitorArticlesResults] = await Promise.allSettled([
        articleScraper.scrapeArticle(ownUrl),
        ...competitorUrls.map((url) => articleScraper.scrapeArticle(url)),
      ]);

      // 自社記事の取得結果を処理
      if (ownArticle.status === "rejected") {
        const errorReason = ownArticle.reason;
        console.error(`[CompetitorAnalysis] Failed to scrape own article ${ownUrl}:`, errorReason);
        
        // 404エラーの場合は、分析を続行できるように警告を出して続行
        if (errorReason?.message?.includes("404") || errorReason?.message?.includes("Not Found")) {
          console.warn(`[CompetitorAnalysis] Own article URL returned 404, skipping diff analysis but continuing with other analysis`);
          // 差分分析をスキップして続行（Step3Resultの形式に合わせる）
          return {
            diffAnalysis: undefined,
            semanticDiffAnalysis: undefined,
            aiSEOAnalysis: undefined,
          };
        }
        
        throw new Error(`Failed to scrape own article: ${errorReason?.message || errorReason}`);
      }
      const ownArticleContent = ownArticle.value;

      // 競合記事の取得結果を処理
      const competitorArticles = [];
      for (let i = 0; i < competitorArticlesResults.length; i++) {
        const result = competitorArticlesResults[i];
        if (result.status === "fulfilled") {
          competitorArticles.push(result.value);
        } else {
          console.error(
            `[CompetitorAnalysis] Failed to scrape competitor ${competitorUrls[i]}:`,
            result.reason
          );
          // エラーが発生しても続行
        }
      }

      if (competitorArticles.length > 0) {
        // タイムアウトチェック
        checkTimeout();
        
        // 基本的な差分分析
        diffAnalysis = diffAnalyzer.analyze(ownArticleContent, competitorArticles);
        console.log(
          `[CompetitorAnalysis] ⏱️ Step 3.1 (Diff analysis) complete: ${diffAnalysis.recommendations.length} recommendations`
        );

        // AI SEO対策分析
        const step3_1_5Start = Date.now();
        try {
          checkTimeout(); // タイムアウトチェック
          console.log(`[CompetitorAnalysis] ⏱️ Step 3.1.5 (AI SEO analysis) starting`);
          aiSEOAnalysis = aiSEOAnalyzer.analyzeAISEO(ownArticleContent, competitorArticles);
          console.log(
            `[CompetitorAnalysis] ⏱️ Step 3.1.5 (AI SEO analysis) complete: ${aiSEOAnalysis.missingElements.length} missing elements, ${aiSEOAnalysis.recommendations.length} recommendations in ${Date.now() - step3_1_5Start}ms`
          );
        } catch (error: any) {
          console.error(`[CompetitorAnalysis] AI SEO analysis failed:`, error);
          // エラーが発生しても続行
        }

        // 意味レベルの差分分析（LLM APIが利用可能な場合、かつスキップフラグがfalseの場合）
        const step3_2Start = Date.now();
        if (!skipLLMAnalysis && LLMDiffAnalyzer.isAvailable() && prioritizedKeywords.length > 0) {
          checkTimeout(); // タイムアウトチェック
          try {
            const providerType = process.env.LLM_PROVIDER || "groq";
            console.log(`[CompetitorAnalysis] ⏱️ Step 3.2 (LLM analysis) starting with ${providerType.toUpperCase()}`);
            
            // 各キーワードごとに分析を実行（順次実行でタイムアウト対策）
            const keywordSpecificAnalyses: LLMDiffAnalysisResult["keywordSpecificAnalysis"] = [];
            let firstSemanticAnalysis: LLMDiffAnalysisResult["semanticAnalysis"] | undefined;

            // キーワード数を制限（タイムアウト対策）
            const maxKeywordsForAnalysis = 3; // 最大3キーワードまで
            const keywordsToAnalyze = prioritizedKeywords.slice(0, maxKeywordsForAnalysis);
            
            if (prioritizedKeywords.length > maxKeywordsForAnalysis) {
              console.log(
                `[CompetitorAnalysis] Limiting keyword analysis to ${maxKeywordsForAnalysis} keywords (from ${prioritizedKeywords.length}) to prevent timeout`
              );
            }

            // キーワード分析関数
            const analyzeKeyword = async (prioritizedKeyword: typeof prioritizedKeywords[0]) => {
              try {
                console.log(
                  `[CompetitorAnalysis] Starting semantic diff analysis with ${providerType.toUpperCase()} API for keyword: "${prioritizedKeyword.keyword}"`
                );

                // このキーワードに対応する競合URLを取得
                const keywordCompetitorUrls = competitorResults
                  .find((result) => result.keyword === prioritizedKeyword.keyword)
                  ?.competitors.map((comp) => comp.url)
                  .slice(0, 3) || []; // 上位3サイトまで

                if (keywordCompetitorUrls.length === 0) {
                  console.log(
                    `[CompetitorAnalysis] No competitors found for keyword: "${prioritizedKeyword.keyword}", skipping analysis`
                  );
                  return {
                    keyword: prioritizedKeyword.keyword,
                    analysis: null,
                    skipped: true,
                  };
                }

                // このキーワードに対応する競合記事を並列で取得（処理時間を短縮）
                const keywordCompetitorArticlesResults = await Promise.allSettled(
                  keywordCompetitorUrls.map((url) => articleScraper.scrapeArticle(url))
                );

                const keywordCompetitorArticles = [];
                for (let i = 0; i < keywordCompetitorArticlesResults.length; i++) {
                  const result = keywordCompetitorArticlesResults[i];
                  if (result.status === "fulfilled") {
                    keywordCompetitorArticles.push(result.value);
                  } else {
                    console.error(
                      `[CompetitorAnalysis] Failed to scrape competitor ${keywordCompetitorUrls[i]} for keyword "${prioritizedKeyword.keyword}":`,
                      result.reason
                    );
                    // エラーが発生しても続行
                  }
                }

                if (keywordCompetitorArticles.length === 0) {
                  console.warn(
                    `[CompetitorAnalysis] No competitor articles scraped for keyword: "${prioritizedKeyword.keyword}" (${keywordCompetitorUrls.length} URLs attempted)`
                  );
                  return {
                    keyword: prioritizedKeyword.keyword,
                    analysis: null,
                    error: getErrorMessage(locale, "errors.competitorArticleFetchFailed"),
                  };
                }

                // このキーワードで意味レベルの分析を実行
                const keywordAnalysis = await llmDiffAnalyzer.analyzeSemanticDiff(
                  prioritizedKeyword.keyword,
                  ownArticleContent,
                  keywordCompetitorArticles,
                  locale
                );

                console.log(
                  `[CompetitorAnalysis] Semantic diff analysis complete for keyword "${prioritizedKeyword.keyword}": ${keywordAnalysis.keywordSpecificAnalysis?.length || 0} keyword-specific items`
                );

                return {
                  keyword: prioritizedKeyword.keyword,
                  analysis: keywordAnalysis,
                  firstSemanticAnalysis: keywordAnalysis.semanticAnalysis,
                };
              } catch (error: any) {
                console.error(
                  `[CompetitorAnalysis] Semantic diff analysis failed for keyword "${prioritizedKeyword.keyword}":`,
                  error
                );
                return {
                  keyword: prioritizedKeyword.keyword,
                  analysis: null,
                  error: error.message || "Unknown error",
                };
              }
            };
            
            // タイムアウトチェック
            checkTimeout();
            
            // キーワード分析を順次実行（タイムアウト対策：並列ではなく順次で処理時間を制御）
            console.log(`[CompetitorAnalysis] Running ${keywordsToAnalyze.length} keyword analyses sequentially to prevent timeout...`);
            type KeywordAnalysisResult = PromiseSettledResult<{
              keyword: string;
              analysis: LLMDiffAnalysisResult | null;
              firstSemanticAnalysis?: LLMDiffAnalysisResult["semanticAnalysis"];
              error?: string;
              skipped?: boolean;
              reason?: string;
            }>;
            const keywordAnalysisResults: KeywordAnalysisResult[] = [];
            
            // 順次実行してタイムアウトチェックを挿入
            for (const keyword of keywordsToAnalyze) {
              checkTimeout(); // 各キーワード分析前にタイムアウトチェック
              
              try {
                // 各キーワード分析に15秒のタイムアウトを設定
                const result = await Promise.race([
                  analyzeKeyword(keyword),
                  new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error(`Keyword analysis timeout: ${keyword.keyword}`)), 15000)
                  )
                ]);
                
                keywordAnalysisResults.push({ status: 'fulfilled' as const, value: result });
              } catch (error: any) {
                console.warn(`[CompetitorAnalysis] Keyword analysis failed or timed out for "${keyword.keyword}":`, error);
                keywordAnalysisResults.push({ 
                  status: 'fulfilled' as const,
                  value: {
                    keyword: keyword.keyword,
                    analysis: null,
                    error: error.message || "Unknown error",
                  }
                });
              }
            }
            
            // 残りのキーワードはスキップされたことを記録
            const skippedKeywords = prioritizedKeywords.slice(maxKeywordsForAnalysis);
            for (const kw of skippedKeywords) {
              keywordAnalysisResults.push({
                status: 'fulfilled' as const,
                value: {
                  keyword: kw.keyword,
                  analysis: null,
                  skipped: true,
                  reason: 'タイムアウト対策のため分析をスキップしました',
                }
              });
            }

            // 結果を処理
            for (const result of keywordAnalysisResults) {
              if (result.status === "fulfilled") {
                const { keyword, analysis, firstSemanticAnalysis: fsAnalysis, error, skipped } = result.value;
                
                if (skipped) {
                  continue; // スキップされたキーワードは無視
                }

                if (analysis) {
                  // 最初のキーワードのsemanticAnalysisを保存
                  if (fsAnalysis && !firstSemanticAnalysis) {
                    firstSemanticAnalysis = fsAnalysis;
                  }

                  // keywordSpecificAnalysisを追加
                  if (analysis.keywordSpecificAnalysis && analysis.keywordSpecificAnalysis.length > 0) {
                    keywordSpecificAnalyses.push(...analysis.keywordSpecificAnalysis);
                    console.log(
                      `[CompetitorAnalysis] Added ${analysis.keywordSpecificAnalysis.length} keyword-specific analysis items for "${keyword}"`
                    );
                  } else {
                    keywordSpecificAnalyses.push({
                      keyword,
                      whyRankingDropped: getErrorMessage(locale, "errors.llmAnalysisResultInvalid"),
                      whatToAdd: [],
                    });
                  }
                } else {
                  // エラーが発生した場合
                  keywordSpecificAnalyses.push({
                    keyword,
                    whyRankingDropped: `分析中にエラーが発生しました: ${error || "Unknown error"}`,
                    whatToAdd: [],
                  });
                }
              } else {
                // Promiseがrejectedされた場合（通常は発生しないが、型安全性のため）
                console.error(`[CompetitorAnalysis] Promise rejected for keyword analysis:`, result.reason);
                // エラー情報を含むプレースホルダーを追加
                const keyword = prioritizedKeywords.find(kw => 
                  keywordAnalysisResults.findIndex(r => 
                    r.status === 'fulfilled' && r.value.keyword === kw.keyword
                  ) === -1
                )?.keyword || "unknown";
                keywordSpecificAnalyses.push({
                  keyword,
                  whyRankingDropped: `分析中にエラーが発生しました: ${result.reason}`,
                  whatToAdd: [],
                });
              }
            }

            // 分析結果が不足しているキーワードを確認
            const analyzedKeywords = new Set(keywordSpecificAnalyses.map((a) => a.keyword));
            for (const kw of prioritizedKeywords) {
              if (!analyzedKeywords.has(kw.keyword)) {
                console.warn(
                  `[CompetitorAnalysis] Missing analysis for keyword: "${kw.keyword}", adding placeholder`
                );
                keywordSpecificAnalyses.push({
                  keyword: kw.keyword,
                  whyRankingDropped: getErrorMessage(locale, "errors.analysisResultNotRetrieved"),
                  whatToAdd: [],
                });
              }
            }

            if (firstSemanticAnalysis && keywordSpecificAnalyses.length > 0) {
              semanticDiffAnalysis = {
                semanticAnalysis: firstSemanticAnalysis,
                keywordSpecificAnalysis: keywordSpecificAnalyses,
              };

              console.log(
                `[CompetitorAnalysis] ⏱️ Step 3.2 (LLM analysis) complete: ${Date.now() - step3_2Start}ms, ${keywordSpecificAnalyses.length} keyword-specific analyses`
              );
            }
          } catch (error: any) {
            console.error("[CompetitorAnalysis] Semantic diff analysis failed:", error);
            // 意味レベルの分析が失敗しても続行
          }
        }
      }
    } catch (error: any) {
      console.error("[CompetitorAnalysis] Diff analysis failed:", error);
      // タイムアウトエラーの場合は中間結果を返す
      if (error.message?.includes("タイムアウト")) {
        console.warn("[CompetitorAnalysis] Timeout detected, returning partial results");
        await articleScraper.close();
        return {
          diffAnalysis,
          semanticDiffAnalysis,
          aiSEOAnalysis,
          partialResults: true,
          timeoutError: error.message,
        };
      }
      // その他のエラーは続行
    }
  }

  // クリーンアップ
  await articleScraper.close();

  const totalTime = Date.now() - startTime;
  console.log(`[CompetitorAnalysis] ⏱️ Step 3 complete: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

  return {
    diffAnalysis,
    semanticDiffAnalysis,
    aiSEOAnalysis,
  };
}

