import { ArticleScraper } from "./article-scraper";
import { DiffAnalyzer, type DiffAnalysisResult } from "./diff-analyzer";
import { LLMDiffAnalyzer, type LLMDiffAnalysisResult } from "./llm-diff-analyzer";
import type { Step1Result, Step2Result, Step3Result } from "./competitor-analysis";

/**
 * Step 3: 記事スクレイピング + LLM分析
 */
export async function analyzeStep3(
  siteUrl: string,
  pageUrl: string,
  prioritizedKeywords: Step1Result["prioritizedKeywords"],
  competitorResults: Step2Result["competitorResults"],
  uniqueCompetitorUrls: Step2Result["uniqueCompetitorUrls"],
  skipLLMAnalysis: boolean = false
): Promise<Step3Result> {
  const startTime = Date.now();
  console.log(`[CompetitorAnalysis] ⏱️ Step 3 starting at ${new Date().toISOString()}`);

  const articleScraper = new ArticleScraper();
  const diffAnalyzer = new DiffAnalyzer();
  const llmDiffAnalyzer = new LLMDiffAnalyzer();

  let diffAnalysis: DiffAnalysisResult | undefined;
  let semanticDiffAnalysis: LLMDiffAnalysisResult | undefined;

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
        throw new Error(`Failed to scrape own article: ${ownArticle.reason}`);
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
        // 基本的な差分分析
        diffAnalysis = diffAnalyzer.analyze(ownArticleContent, competitorArticles);
        console.log(
          `[CompetitorAnalysis] ⏱️ Step 3.1 (Diff analysis) complete: ${diffAnalysis.recommendations.length} recommendations`
        );

        // 意味レベルの差分分析（LLM APIが利用可能な場合、かつスキップフラグがfalseの場合）
        const step3_2Start = Date.now();
        if (!skipLLMAnalysis && LLMDiffAnalyzer.isAvailable() && prioritizedKeywords.length > 0) {
          try {
            const providerType = process.env.LLM_PROVIDER || "groq";
            console.log(`[CompetitorAnalysis] ⏱️ Step 3.2 (LLM analysis) starting with ${providerType.toUpperCase()}`);
            
            // 各キーワードごとに分析を実行（並列化して処理時間を短縮）
            const keywordSpecificAnalyses: LLMDiffAnalysisResult["keywordSpecificAnalysis"] = [];
            let firstSemanticAnalysis: LLMDiffAnalysisResult["semanticAnalysis"] | undefined;

            // すべてのキーワードの競合記事を並列で取得（処理時間を短縮）
            const keywordAnalysisPromises = prioritizedKeywords.map(async (prioritizedKeyword) => {
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
                    error: "競合記事の取得に失敗しました。競合URLは取得できましたが、記事内容のスクレイピングに失敗した可能性があります。",
                  };
                }

                // このキーワードで意味レベルの分析を実行
                const keywordAnalysis = await llmDiffAnalyzer.analyzeSemanticDiff(
                  prioritizedKeyword.keyword,
                  ownArticleContent,
                  keywordCompetitorArticles
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
            });

            // すべてのキーワード分析を並列で実行（処理時間を大幅に短縮）
            console.log(`[CompetitorAnalysis] Running ${prioritizedKeywords.length} keyword analyses in parallel...`);
            const keywordAnalysisResults = await Promise.allSettled(keywordAnalysisPromises);

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
                      whyRankingDropped: "LLM分析の結果が取得できませんでした。APIのレスポンス形式が不正な可能性があります。",
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
                // Promiseがrejectedされた場合
                console.error(`[CompetitorAnalysis] Promise rejected for keyword analysis:`, result.reason);
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
                  whyRankingDropped: "分析結果が取得できませんでした。",
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
      // 差分分析が失敗しても続行
    }
  }

  // クリーンアップ
  await articleScraper.close();

  const totalTime = Date.now() - startTime;
  console.log(`[CompetitorAnalysis] ⏱️ Step 3 complete: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

  return {
    diffAnalysis,
    semanticDiffAnalysis,
  };
}

