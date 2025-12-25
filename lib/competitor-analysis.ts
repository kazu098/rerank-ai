import { getGSCClient } from "./gsc-api";
import { RankDropDetector, RankDropResult } from "./rank-drop-detection";
import { KeywordPrioritizer } from "./keyword-prioritizer";
import { CompetitorExtractor, SearchResult } from "./competitor-extractor";

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
}

/**
 * 競合分析クラス
 * 主要なキーワードのみで競合URLを取得
 */
export class CompetitorAnalyzer {
  private keywordPrioritizer: KeywordPrioritizer;
  private competitorExtractor: CompetitorExtractor;

  constructor() {
    this.keywordPrioritizer = new KeywordPrioritizer();
    this.competitorExtractor = new CompetitorExtractor();
  }

  /**
   * 順位下落を検知し、主要なキーワードで競合URLを取得
   * @param siteUrl サイトURL
   * @param pageUrl ページURL
   * @param maxKeywords 分析する最大キーワード数（デフォルト: 3）
   * @param maxCompetitorsPerKeyword キーワードあたりの最大競合URL数（デフォルト: 10、1ページ目の上限）
   */
  async analyzeCompetitors(
    siteUrl: string,
    pageUrl: string,
    maxKeywords: number = 3,
    maxCompetitorsPerKeyword: number = 10
  ): Promise<CompetitorAnalysisSummary> {
    // GSCクライアントを取得
    const client = await getGSCClient();
    const detector = new RankDropDetector(client);

    // 順位下落を検知
    const rankDropResult = await detector.detectRankDrop(siteUrl, pageUrl);

    // キーワードデータを取得
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const keywordData = await client.getKeywordData(
      siteUrl,
      pageUrl,
      startDate,
      endDate
    );

    // キーワードを優先順位付け
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

    if (rankDropResult.droppedKeywords.length > 0) {
      // 転落キーワードを優先
      prioritizedKeywords = this.keywordPrioritizer
        .prioritizeDroppedKeywords(rankDropResult.droppedKeywords, maxKeywords)
        .map((kw) => ({
          keyword: kw.keyword,
          priority: kw.priority,
          impressions: kw.impressions,
          clicks: kw.clicks,
          position: kw.position,
        }));
    }

    // 転落キーワードが少ない場合、全体から主要なキーワードを追加
    if (prioritizedKeywords.length < maxKeywords) {
      const additionalKeywords = this.keywordPrioritizer
        .prioritizeKeywords(keywordList, maxKeywords - prioritizedKeywords.length)
        .filter(
          (kw) =>
            !prioritizedKeywords.find((pk) => pk.keyword === kw.keyword)
        )
        .map((kw) => ({
          keyword: kw.keyword,
          priority: kw.priority,
          impressions: kw.impressions,
          clicks: kw.clicks,
          position: kw.position,
        }));

      prioritizedKeywords.push(...additionalKeywords);
    }

    // 上位N個に絞る
    prioritizedKeywords = prioritizedKeywords
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxKeywords);

    // 各キーワードで競合URLを取得
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

        competitorResults.push({
          keyword: prioritizedKeyword.keyword,
          competitors: competitorsAboveOwn,
          ownPosition: result.ownPosition || ownKeywordPosition,
          totalResults: result.totalResults,
        });

        // ユニークな競合URLを収集
        competitorsAboveOwn.forEach((comp) => {
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

    // クリーンアップ
    await this.competitorExtractor.close();

    return {
      prioritizedKeywords,
      competitorResults,
      uniqueCompetitorUrls: Array.from(uniqueCompetitorUrls),
    };
  }


  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

