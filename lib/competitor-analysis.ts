import { getGSCClient } from "./gsc-api";
import { RankDropDetector, RankDropResult } from "./rank-drop-detection";
import { KeywordPrioritizer } from "./keyword-prioritizer";
import { CompetitorExtractor, SearchResult } from "./competitor-extractor";
import { ArticleScraper } from "./article-scraper";
import { DiffAnalyzer, DiffAnalysisResult } from "./diff-analyzer";
import { LLMDiffAnalyzer, LLMDiffAnalysisResult } from "./llm-diff-analyzer";
import { AISEOAnalyzer, AISEOAnalysisResult } from "./ai-seo-analyzer";
import { filterCompetitorUrls } from "./competitor-filter";
import { getErrorMessage } from "./api-helpers";

export interface CompetitorAnalysisResult {
  keyword: string;
  competitors: SearchResult[];
  ownPosition?: number;
  totalResults: number;
  error?: string;
}

export interface CompetitorAnalysisSummary {
  prioritizedKeywords: Array<{
    keyword: string;
    priority: number;
    impressions: number;
    clicks: number;
    position: number;
  }>;
  competitorResults: CompetitorAnalysisResult[];
  uniqueCompetitorUrls: string[];
  diffAnalysis?: DiffAnalysisResult; // 基本的な差分分析結果（オプション）
  semanticDiffAnalysis?: LLMDiffAnalysisResult; // 意味レベルの差分分析結果（オプション）
  aiSEOAnalysis?: AISEOAnalysisResult; // AI SEO対策分析結果（オプション）
  topRankingKeywords?: Array<{
    keyword: string;
    position: number;
    impressions: number;
    clicks: number;
  }>; // 上位を保てているキーワード（1-5位）
  keywordTimeSeries?: Array<{
    keyword: string;
    data: Array<{
      date: string;
      position: number;
      impressions: number;
      clicks: number;
    }>;
    metadata?: {
      lastDataDate: string | null; // 最後にデータが取得された日付
      daysSinceLastData: number | null; // 最後のデータから経過した日数
      hasRecentDrop: boolean; // 最近の転落の可能性
      lastPosition: number | null; // 最後のデータの順位
      serperApiNotFound?: boolean; // Serper APIで見つからなかった（100位以下に転落している可能性）
    };
  }>; // キーワードの時系列データ（グラフ用）
}

// Step 1の結果
export interface Step1Result {
  prioritizedKeywords: Array<{
    keyword: string;
    priority: number;
    impressions: number;
    clicks: number;
    position: number;
  }>;
  topRankingKeywords?: Array<{
    keyword: string;
    position: number;
    impressions: number;
    clicks: number;
  }>;
  keywordTimeSeries?: Array<{
    keyword: string;
    data: Array<{
      date: string;
      position: number;
      impressions: number;
      clicks: number;
    }>;
    metadata?: {
      lastDataDate: string | null; // 最後にデータが取得された日付
      daysSinceLastData: number | null; // 最後のデータから経過した日数
      hasRecentDrop: boolean; // 最近の転落の可能性
      lastPosition: number | null; // 最後のデータの順位
      serperApiNotFound?: boolean; // Serper APIで見つからなかった（100位以下に転落している可能性）
    };
  }>;
}

// Step 2の結果
export interface Step2Result {
  competitorResults: CompetitorAnalysisResult[];
  uniqueCompetitorUrls: string[];
}

// Step 3の結果
export interface Step3Result {
  diffAnalysis?: DiffAnalysisResult;
  semanticDiffAnalysis?: LLMDiffAnalysisResult;
  aiSEOAnalysis?: AISEOAnalysisResult;
  partialResults?: boolean; // タイムアウトなどで中間結果を返した場合
  timeoutError?: string; // タイムアウトエラーメッセージ
}

/**
 * 競合分析クラス
 * 主要なキーワードのみで競合URLを取得
 */
export class CompetitorAnalyzer {
  private keywordPrioritizer: KeywordPrioritizer;
  private competitorExtractor: CompetitorExtractor;
  private articleScraper: ArticleScraper;
  private diffAnalyzer: DiffAnalyzer;
  private llmDiffAnalyzer: LLMDiffAnalyzer;

  private aiSEOAnalyzer: AISEOAnalyzer;

  constructor() {
    this.keywordPrioritizer = new KeywordPrioritizer();
    this.competitorExtractor = new CompetitorExtractor();
    this.articleScraper = new ArticleScraper();
    this.diffAnalyzer = new DiffAnalyzer();
    this.llmDiffAnalyzer = new LLMDiffAnalyzer();
    this.aiSEOAnalyzer = new AISEOAnalyzer();
  }

  /**
   * 順位下落を検知し、主要なキーワードで競合URLを取得
   * @param siteUrl サイトURL
   * @param pageUrl ページURL
   * @param maxKeywords 分析する最大キーワード数（デフォルト: 3）
   * @param maxCompetitorsPerKeyword キーワードあたりの最大競合URL数（デフォルト: 10、1ページ目の上限）
   * @param skipLLMAnalysis LLM分析をスキップするか
   * @param locale ロケール（'ja' | 'en'）
   */
  async analyzeCompetitors(
    siteUrl: string,
    pageUrl: string,
    maxKeywords: number = 3,
    maxCompetitorsPerKeyword: number = 10,
    skipLLMAnalysis: boolean = false,
    locale: string = "ja"
  ): Promise<CompetitorAnalysisSummary> {
    const startTime = Date.now();
    console.log(`[CompetitorAnalysis] ⏱️ Starting analysis at ${new Date().toISOString()}`);
    
    // GSCクライアントを取得
    const client = await getGSCClient();
    const detector = new RankDropDetector(client);

    // 順位下落を検知
    const step1Start = Date.now();
    const rankDropResult = await detector.detectRankDrop(siteUrl, pageUrl);
    console.log(`[CompetitorAnalysis] ⏱️ Step 1 (Rank drop detection): ${Date.now() - step1Start}ms`);

    // キーワードデータを取得
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const step2Start = Date.now();
    const keywordData = await client.getKeywordData(
      siteUrl,
      pageUrl,
      startDate,
      endDate
    );
    console.log(`[CompetitorAnalysis] ⏱️ Step 2 (GSC keyword data): ${Date.now() - step2Start}ms`);

    // キーワードを優先順位付け
    const step3Start = Date.now();
    const keywordList: Array<{
      keyword: string;
      position: number;
      impressions: number;
      clicks: number;
      ctr: number;
    }> = keywordData.rows.map((row) => ({
      keyword: row.keys[0],
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
    }));

    // 転落したキーワードを優先
    let prioritizedKeywords: Array<{
      keyword: string;
      priority: number;
      impressions: number;
      clicks: number;
      position: number;
    }> = [];

    // 最小インプレッション数の閾値（検索ボリュームが少ないキーワードを除外）
    const minImpressions = 10;

    // 転落キーワードと通常キーワードを統合してから、正規化で重複排除
    const allPrioritizedKeywords: typeof prioritizedKeywords = [];

    if (rankDropResult.droppedKeywords.length > 0) {
      // 転落キーワードを優先（意味的に同じキーワードはグループ化）
      const droppedPrioritized = this.keywordPrioritizer
        .prioritizeDroppedKeywords(rankDropResult.droppedKeywords, maxKeywords * 2, minImpressions)
        .map((kw) => ({
          keyword: kw.keyword,
          priority: kw.priority,
          impressions: kw.impressions,
          clicks: kw.clicks,
          position: kw.position,
        }));
      allPrioritizedKeywords.push(...droppedPrioritized);
    }

    // 全体から主要なキーワードを追加（意味的に同じキーワードはグループ化）
    const regularPrioritized = this.keywordPrioritizer
      .prioritizeKeywords(keywordList, maxKeywords * 2, minImpressions)
      .map((kw) => ({
        keyword: kw.keyword,
        priority: kw.priority,
        impressions: kw.impressions,
        clicks: kw.clicks,
        position: kw.position,
      }));
    allPrioritizedKeywords.push(...regularPrioritized);

    console.log(`[CompetitorAnalysis] ⏱️ Step 3 (Keyword prioritization): ${Date.now() - step3Start}ms`);
    
    // 意味的に同じキーワードを統合（最終的な重複排除）
    // KeywordPrioritizerの正規化メソッドを使用して統一
    // 同じ正規化キーワードが複数ある場合、優先度が最も高いものを選定
    const keywordMap = new Map<string, typeof prioritizedKeywords[0]>();

    // 優先度の高い順に処理
    allPrioritizedKeywords
      .sort((a, b) => b.priority - a.priority)
      .forEach((kw) => {
        const normalized = this.keywordPrioritizer.normalizeKeyword(kw.keyword);
        // まだ登録されていない、または現在のキーワードの優先度が高い場合のみ更新
        if (!keywordMap.has(normalized) || keywordMap.get(normalized)!.priority < kw.priority) {
          keywordMap.set(normalized, kw);
        }
      });

    // Mapから配列に変換し、優先度順にソート
    prioritizedKeywords = Array.from(keywordMap.values())
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxKeywords);

    // 各キーワードで競合URLを取得
    const step4Start = Date.now();
    const competitorResults: CompetitorAnalysisResult[] = [];
    const uniqueCompetitorUrls = new Set<string>();

        // 自社URLを正規化
        const normalizedOwnUrl = this.competitorExtractor.normalizeUrl(`${siteUrl}${pageUrl}`);

    for (const prioritizedKeyword of prioritizedKeywords) {
      // このキーワードでの自社の順位を取得（GSC APIから）
      // キーワードごとに順位が異なるため、GSC APIで正確な順位を取得
      // 既に取得したkeywordDataから該当キーワードの順位を取得
      const ownKeywordPosition = keywordList.find(
        (kw) => kw.keyword === prioritizedKeyword.keyword
      )?.position;

      try {
        // リクエスト間隔を調整（10-20秒、CAPTCHA対策のため長めに）
        if (competitorResults.length > 0) {
          const delayMs = 10000 + Math.random() * 10000;
          console.log(`[CompetitorAnalysis] Waiting ${delayMs.toFixed(0)}ms before next keyword...`);
          await this.delay(delayMs);
        }

        // 自社の順位より上位のサイトを取得
        // 閾値: 20位を境界に、それ以上は1ページ目（上位10サイト）のみを分析
        let maxCompetitors = maxCompetitorsPerKeyword;
        if (ownKeywordPosition) {
          if (ownKeywordPosition <= 1) {
            // 自社が1位の場合、競合URLは取得しない
            competitorResults.push({
              keyword: prioritizedKeyword.keyword,
              competitors: [],
              ownPosition: ownKeywordPosition,
              totalResults: 0,
            });
            continue;
          } else if (ownKeywordPosition <= 10) {
            // 自社が2-10位の場合、自社より上位のみ（最大10サイト、実際は最大9サイト）
            // 例: 5位の場合、1-4位の4サイトを取得
            maxCompetitors = Math.min(ownKeywordPosition - 1, maxCompetitorsPerKeyword);
          } else if (ownKeywordPosition <= 20) {
            // 自社が11-20位の場合、1ページ目（上位10サイト）のみを取得
            // 自社より上位が多すぎるため、検索結果1ページ目の競合を分析
            maxCompetitors = maxCompetitorsPerKeyword;
          } else {
            // 自社が21位以上の場合、1ページ目（上位10サイト）のみを取得
            // 2ページ目以降は分析価値が低いため、1ページ目の競合を分析
            maxCompetitors = maxCompetitorsPerKeyword;
          }
        }

        console.log(
          `[CompetitorAnalysis] Extracting competitors for keyword: "${prioritizedKeyword.keyword}", ownPosition: ${ownKeywordPosition}, maxCompetitors: ${maxCompetitors}`
        );

        // 本番環境ではSerper APIを優先（環境変数で制御可能）
        const preferSerperApi = process.env.PREFER_SERPER_API === "true" || process.env.NODE_ENV === "production";
        
        // GSC APIから取得した自社の順位を取得（動的取得数の最適化のため）
        // 注意: extractCompetitors内で順位を取得するが、事前に取得した順位があれば最適化に使用
        
        const result = await this.competitorExtractor.extractCompetitors(
          prioritizedKeyword.keyword,
          normalizedOwnUrl,
          maxCompetitors,
          5, // retryCount
          false, // preferSerperApi
          false, // isManualScan
          locale
          5, // retryCount
          preferSerperApi
        );

        console.log(
          `[CompetitorAnalysis] Extracted ${result.competitors.length} competitors, ownPosition: ${result.ownPosition}, totalResults: ${result.totalResults}`
        );

        // 自社の順位より上位のサイトのみをフィルタリング
        // ただし、自社が11位以上の場合、1ページ目（上位10サイト）のみを取得
        const competitorsAboveOwn = result.competitors.filter((comp) => {
          if (result.ownPosition) {
            if (result.ownPosition <= 10) {
              // 自社が1-10位の場合、自社より上位のみ
              return comp.position < result.ownPosition;
            } else {
              // 自社が11位以上の場合、1ページ目（上位10サイト）のみ
              return comp.position <= 10;
            }
          }
          // 自社URLが見つからない場合、すべてを競合として扱う
          return comp.url !== normalizedOwnUrl;
        });

        console.log(
          `[CompetitorAnalysis] Filtered to ${competitorsAboveOwn.length} competitors above own position`
        );

        // 競合URLをフィルタリング（Wikipedia、ECサイト等を除外）
        const competitorUrls = competitorsAboveOwn.map((comp) => comp.url);
        const { filteredUrls, excludedUrls } = filterCompetitorUrls(competitorUrls, {
          useGlobalExclusion: true,
          useDefaultExclusion: true,
          ownSiteUrl: normalizedOwnUrl,
        });

        if (excludedUrls.length > 0) {
          console.log(
            `[CompetitorAnalysis] Excluded ${excludedUrls.length} URLs: ${excludedUrls.map((e) => e.domain).join(", ")}`
          );
        }

        // フィルタリング後のURLのみを保持
        const filteredCompetitors = competitorsAboveOwn.filter((comp) =>
          filteredUrls.includes(comp.url)
        );

        console.log(
          `[CompetitorAnalysis] After filtering: ${filteredCompetitors.length} competitors (excluded ${competitorsAboveOwn.length - filteredCompetitors.length})`
        );

        competitorResults.push({
          keyword: prioritizedKeyword.keyword,
          competitors: filteredCompetitors,
          ownPosition: result.ownPosition || ownKeywordPosition,
          totalResults: result.totalResults,
        });

        // ユニークな競合URLを収集（フィルタリング後）
        filteredCompetitors.forEach((comp) => {
          uniqueCompetitorUrls.add(comp.url);
        });
      } catch (error: any) {
        console.error(
          `Error extracting competitors for keyword "${prioritizedKeyword.keyword}":`,
          error
        );
        // エラーが発生した場合でも、空の結果を追加して続行
        // CAPTCHAエラーの場合は特別なメッセージを追加
        const errorMessage = error.message || "Unknown error";
        const isCaptchaError = errorMessage.includes("CAPTCHA");
        
        competitorResults.push({
          keyword: prioritizedKeyword.keyword,
          competitors: [],
          ownPosition: ownKeywordPosition,
          totalResults: 0,
          error: isCaptchaError 
            ? "CAPTCHAが検出されました。しばらく時間をおいてから再度お試しください。"
            : errorMessage,
        });
      }
    }

    // 差分分析を実行（競合URLが取得できた場合）
    let diffAnalysis: DiffAnalysisResult | undefined;
    let aiSEOAnalysis: AISEOAnalysisResult | undefined;
    if (uniqueCompetitorUrls.size > 0 && competitorResults.length > 0) {
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
        const competitorUrls = Array.from(uniqueCompetitorUrls).slice(0, 3); // 上位3サイトまで

        // 自社記事と競合記事を並列で取得（処理時間を短縮）
        const [ownArticle, ...competitorArticlesResults] = await Promise.allSettled([
          this.articleScraper.scrapeArticle(ownUrl),
          ...competitorUrls.map((url) => this.articleScraper.scrapeArticle(url)),
        ]);

        // 自社記事の取得結果を処理
        if (ownArticle.status === "rejected") {
          const errorReason = ownArticle.reason;
          console.error(`[CompetitorAnalysis] Failed to scrape own article ${ownUrl}:`, errorReason);
          
          // 404エラーの場合は、分析を続行できるように警告を出して続行
          if (errorReason?.message?.includes("404") || errorReason?.message?.includes("Not Found")) {
            console.warn(`[CompetitorAnalysis] Own article URL returned 404, skipping diff analysis but continuing with other analysis`);
            // 差分分析をスキップして続行（ローカル変数を使用）
            return {
              prioritizedKeywords,
              competitorResults,
              uniqueCompetitorUrls: Array.from(uniqueCompetitorUrls),
              keywordTimeSeries: [],
              semanticDiffAnalysis: undefined,
              aiSEOAnalysis: undefined,
              topRankingKeywords: prioritizedKeywords.filter((kw: any) => kw.position <= 10),
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
          // 基本的な差分分析
          diffAnalysis = this.diffAnalyzer.analyze(ownArticleContent, competitorArticles);
          console.log(
            `[CompetitorAnalysis] Diff analysis complete: ${diffAnalysis.recommendations.length} recommendations`
          );

          // AI SEO対策分析
          const aiSEOStart = Date.now();
          try {
            console.log(`[CompetitorAnalysis] ⏱️ AI SEO analysis starting`);
            aiSEOAnalysis = this.aiSEOAnalyzer.analyzeAISEO(ownArticleContent, competitorArticles);
            console.log(
              `[CompetitorAnalysis] ⏱️ AI SEO analysis complete: ${aiSEOAnalysis.missingElements.length} missing elements, ${aiSEOAnalysis.recommendations.length} recommendations in ${Date.now() - aiSEOStart}ms`
            );
          } catch (error: any) {
            console.error(`[CompetitorAnalysis] AI SEO analysis failed:`, error);
            // エラーが発生しても続行
          }

          // 意味レベルの差分分析（LLM APIが利用可能な場合、かつスキップフラグがfalseの場合）
          const step6Start = Date.now();
          if (!skipLLMAnalysis && LLMDiffAnalyzer.isAvailable() && prioritizedKeywords.length > 0) {
            try {
              const providerType = process.env.LLM_PROVIDER || "groq";
              console.log(`[CompetitorAnalysis] ⏱️ Step 6 (LLM analysis) starting with ${providerType.toUpperCase()}`);
              
              // 各キーワードごとに分析を実行（並列化して処理時間を短縮）
              const keywordSpecificAnalyses: LLMDiffAnalysisResult["keywordSpecificAnalysis"] = [];
              let firstSemanticAnalysis: LLMDiffAnalysisResult["semanticAnalysis"] | undefined;

              // まず、すべてのキーワードの競合記事を並列で取得（処理時間を短縮）
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
                    keywordCompetitorUrls.map((url) => this.articleScraper.scrapeArticle(url))
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
                  const keywordAnalysis = await this.llmDiffAnalyzer.analyzeSemanticDiff(
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

              // すべての分析結果を統合
              // すべてのキーワードの分析結果が含まれているか確認
              console.log(
                `[CompetitorAnalysis] Total keyword-specific analyses collected: ${keywordSpecificAnalyses.length}, expected: ${prioritizedKeywords.length}`
              );
              
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
                const semanticDiffAnalysis: LLMDiffAnalysisResult = {
                  semanticAnalysis: firstSemanticAnalysis,
                  keywordSpecificAnalysis: keywordSpecificAnalyses,
                };

                console.log(
                  `[CompetitorAnalysis] ⏱️ Step 6 (LLM analysis) complete: ${Date.now() - step6Start}ms, ${keywordSpecificAnalyses.length} keyword-specific analyses for keywords: ${keywordSpecificAnalyses.map((a) => a.keyword).join(", ")}`
                );

                // クリーンアップ
                await this.competitorExtractor.close();
                await this.articleScraper.close();

                // 上位を保てているキーワードを抽出（1-5位）
                const topRankingKeywords = keywordList
                  .filter((kw) => kw.position >= 1 && kw.position <= 5 && kw.impressions >= 10)
                  .sort((a, b) => a.position - b.position)
                  .slice(0, 5)
                  .map((kw) => ({
                    keyword: kw.keyword,
                    position: kw.position,
                    impressions: kw.impressions,
                    clicks: kw.clicks,
                  }));

                // 選定されたキーワードの時系列データを取得（グラフ用）
                let keywordTimeSeries: CompetitorAnalysisSummary["keywordTimeSeries"] = [];
                try {
                  const selectedKeywords = prioritizedKeywords.map((kw) => kw.keyword);
                  const timeSeriesData = await client.getKeywordTimeSeriesData(
                    siteUrl,
                    pageUrl,
                    startDate,
                    endDate,
                    selectedKeywords
                  );

                  // キーワードごとに時系列データをグループ化
                  const timeSeriesMap = new Map<string, Array<{ date: string; position: number; impressions: number; clicks: number }>>();
                  
                  for (const row of timeSeriesData.rows) {
                    const keyword = row.keys[1]; // keys[0] = date, keys[1] = query
                    const date = row.keys[0];
                    
                    if (!timeSeriesMap.has(keyword)) {
                      timeSeriesMap.set(keyword, []);
                    }
                    
                    timeSeriesMap.get(keyword)!.push({
                      date,
                      position: row.position,
                      impressions: row.impressions,
                      clicks: row.clicks,
                    });
                  }

                  // 日付順にソート
                  for (const [keyword, data] of timeSeriesMap.entries()) {
                    data.sort((a, b) => a.date.localeCompare(b.date));
                    keywordTimeSeries.push({ keyword, data });
                  }
                } catch (error: any) {
                  console.error("[CompetitorAnalysis] Failed to get keyword time series data:", error);
                  // 時系列データの取得に失敗しても続行
                }

                return {
                  prioritizedKeywords,
                  competitorResults,
                  uniqueCompetitorUrls: Array.from(uniqueCompetitorUrls),
                  diffAnalysis,
                  semanticDiffAnalysis,
                  aiSEOAnalysis,
                  topRankingKeywords: topRankingKeywords.length > 0 ? topRankingKeywords : undefined,
                  keywordTimeSeries: keywordTimeSeries.length > 0 ? keywordTimeSeries : undefined,
                };
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

    // 上位を保てているキーワードを抽出（1-5位）
    const topRankingKeywords = keywordList
      .filter((kw) => kw.position >= 1 && kw.position <= 5 && kw.impressions >= 10)
      .sort((a, b) => a.position - b.position)
      .slice(0, 5)
      .map((kw) => ({
        keyword: kw.keyword,
        position: kw.position,
        impressions: kw.impressions,
        clicks: kw.clicks,
      }));

    // 選定されたキーワードの時系列データを取得（グラフ用）
    let keywordTimeSeries: CompetitorAnalysisSummary["keywordTimeSeries"] = [];
    if (prioritizedKeywords.length > 0) {
      try {
        const selectedKeywords = prioritizedKeywords.map((kw) => kw.keyword);
        const timeSeriesData = await client.getKeywordTimeSeriesData(
          siteUrl,
          pageUrl,
          startDate,
          endDate,
          selectedKeywords
        );

        // キーワードごとに時系列データをグループ化
        const timeSeriesMap = new Map<string, Array<{ date: string; position: number; impressions: number; clicks: number }>>();
        
        for (const row of timeSeriesData.rows) {
          const keyword = row.keys[1]; // keys[0] = date, keys[1] = query
          const date = row.keys[0];
          
          if (!timeSeriesMap.has(keyword)) {
            timeSeriesMap.set(keyword, []);
          }
          
          timeSeriesMap.get(keyword)!.push({
            date,
            position: row.position,
            impressions: row.impressions,
            clicks: row.clicks,
          });
        }

        // 日付順にソート
        for (const [keyword, data] of timeSeriesMap.entries()) {
          data.sort((a, b) => a.date.localeCompare(b.date));
          keywordTimeSeries.push({ keyword, data });
        }
      } catch (error: any) {
        console.error("[CompetitorAnalysis] Failed to get keyword time series data:", error);
        // 時系列データの取得に失敗しても続行
      }
    }

    // クリーンアップ
    await this.competitorExtractor.close();
    await this.articleScraper.close();

    return {
      prioritizedKeywords,
      competitorResults,
      uniqueCompetitorUrls: Array.from(uniqueCompetitorUrls),
      diffAnalysis,
      semanticDiffAnalysis: undefined,
      aiSEOAnalysis,
      topRankingKeywords: topRankingKeywords.length > 0 ? topRankingKeywords : undefined,
      keywordTimeSeries: keywordTimeSeries.length > 0 ? keywordTimeSeries : undefined,
    };
  }


  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

