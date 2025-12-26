import { CompetitorExtractor, SearchResult } from "./competitor-extractor";
import { CompetitorAnalysisResult, Step1Result, Step2Result } from "./competitor-analysis";

/**
 * Step 2: 競合URL抽出
 */
export async function analyzeStep2(
  siteUrl: string,
  pageUrl: string,
  prioritizedKeywords: Step1Result["prioritizedKeywords"],
  maxCompetitorsPerKeyword: number = 10
): Promise<Step2Result> {
  const startTime = Date.now();
  console.log(`[CompetitorAnalysis] ⏱️ Step 2 starting at ${new Date().toISOString()}`);

  const competitorExtractor = new CompetitorExtractor();
  const competitorResults: CompetitorAnalysisResult[] = [];
  const uniqueCompetitorUrls = new Set<string>();

  // 自社URLを正規化
  const normalizedOwnUrl = competitorExtractor.normalizeUrl(`${siteUrl}${pageUrl}`);

  // キーワードデータから順位を取得するためのマップ（Step1の結果に含まれている）
  const keywordPositionMap = new Map<string, number>();
  prioritizedKeywords.forEach((kw) => {
    keywordPositionMap.set(kw.keyword, kw.position);
  });

  for (const prioritizedKeyword of prioritizedKeywords) {
    // このキーワードでの自社の順位を取得
    const ownKeywordPosition = keywordPositionMap.get(prioritizedKeyword.keyword);

    try {
      // 本番環境ではSerper APIを優先（環境変数で制御可能）
      const preferSerperApi = process.env.PREFER_SERPER_API === "true" || process.env.NODE_ENV === "production";
      
      // リクエスト間隔を調整
      // Serper APIを使う場合は短縮（1-3秒）、ブラウザツールの場合は長め（10-20秒、CAPTCHA対策）
      if (competitorResults.length > 0) {
        const delayMs = preferSerperApi 
          ? 1000 + Math.random() * 2000  // Serper API: 1-3秒
          : 10000 + Math.random() * 10000; // ブラウザツール: 10-20秒
        console.log(`[CompetitorAnalysis] Waiting ${delayMs.toFixed(0)}ms before next keyword... (using ${preferSerperApi ? 'Serper API' : 'Browser tool'})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // 自社の順位より上位のサイトを取得
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
          // 自社が2-10位の場合、自社より上位のみ
          maxCompetitors = Math.min(ownKeywordPosition - 1, maxCompetitorsPerKeyword);
        } else {
          // 自社が11位以上の場合、1ページ目（上位10サイト）のみ
          maxCompetitors = maxCompetitorsPerKeyword;
        }
      }

      console.log(
        `[CompetitorAnalysis] Extracting competitors for keyword: "${prioritizedKeyword.keyword}", ownPosition: ${ownKeywordPosition}, maxCompetitors: ${maxCompetitors}`
      );
      
      const result = await competitorExtractor.extractCompetitors(
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
  await competitorExtractor.close();

  const totalTime = Date.now() - startTime;
  console.log(`[CompetitorAnalysis] ⏱️ Step 2 complete: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

  return {
    competitorResults,
    uniqueCompetitorUrls: Array.from(uniqueCompetitorUrls),
  };
}

