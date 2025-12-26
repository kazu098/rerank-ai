import { getGSCClient } from "./gsc-api";
import { RankDropDetector } from "./rank-drop-detection";
import { KeywordPrioritizer } from "./keyword-prioritizer";
import { Step1Result } from "./competitor-analysis";

/**
 * Step 1: GSCデータ取得 + キーワード選定 + 時系列データ取得
 */
export async function analyzeStep1(
  siteUrl: string,
  pageUrl: string,
  maxKeywords: number = 3
): Promise<Step1Result> {
  const startTime = Date.now();
  console.log(`[CompetitorAnalysis] ⏱️ Step 1 starting at ${new Date().toISOString()}`);
  
  // GSCクライアントを取得
  const client = await getGSCClient();
  const detector = new RankDropDetector(client);
  const keywordPrioritizer = new KeywordPrioritizer();

  // 順位下落を検知
  const step1Start = Date.now();
  const rankDropResult = await detector.detectRankDrop(siteUrl, pageUrl);
  console.log(`[CompetitorAnalysis] ⏱️ Step 1.1 (Rank drop detection): ${Date.now() - step1Start}ms`);

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
  console.log(`[CompetitorAnalysis] ⏱️ Step 1.2 (GSC keyword data): ${Date.now() - step2Start}ms`);

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
    const droppedPrioritized = keywordPrioritizer
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
  const regularPrioritized = keywordPrioritizer
    .prioritizeKeywords(keywordList, maxKeywords * 2, minImpressions)
    .map((kw) => ({
      keyword: kw.keyword,
      priority: kw.priority,
      impressions: kw.impressions,
      clicks: kw.clicks,
      position: kw.position,
    }));
  allPrioritizedKeywords.push(...regularPrioritized);

  // 意味的に同じキーワードを統合（最終的な重複排除）
  const keywordMap = new Map<string, typeof prioritizedKeywords[0]>();

  // 優先度の高い順に処理
  allPrioritizedKeywords
    .sort((a, b) => b.priority - a.priority)
    .forEach((kw) => {
      const normalized = keywordPrioritizer.normalizeKeyword(kw.keyword);
      // まだ登録されていない、または現在のキーワードの優先度が高い場合のみ更新
      if (!keywordMap.has(normalized) || keywordMap.get(normalized)!.priority < kw.priority) {
        keywordMap.set(normalized, kw);
      }
    });

  // Mapから配列に変換し、優先度順にソート
  prioritizedKeywords = Array.from(keywordMap.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxKeywords);

  console.log(`[CompetitorAnalysis] ⏱️ Step 1.3 (Keyword prioritization): ${Date.now() - step3Start}ms`);

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
  let keywordTimeSeries: Step1Result["keywordTimeSeries"] = [];
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

  const totalTime = Date.now() - startTime;
  console.log(`[CompetitorAnalysis] ⏱️ Step 1 complete: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

  return {
    prioritizedKeywords,
    topRankingKeywords: topRankingKeywords.length > 0 ? topRankingKeywords : undefined,
    keywordTimeSeries: keywordTimeSeries.length > 0 ? keywordTimeSeries : undefined,
  };
}

