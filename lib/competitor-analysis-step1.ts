import { getGSCClient } from "./gsc-api";
import { RankDropDetector } from "./rank-drop-detection";
import { KeywordPrioritizer } from "./keyword-prioritizer";
import { Step1Result } from "./competitor-analysis";

/**
 * Step 1: GSCデータ取得 + キーワード選定 + 時系列データ取得
 * @param siteUrl サイトURL
 * @param pageUrl ページURL
 * @param maxKeywords 最大キーワード数
 * @param articleTitle 記事のタイトル（オプショナル、キーワード選定の関連性スコアに使用）
 */
export async function analyzeStep1(
  siteUrl: string,
  pageUrl: string,
  maxKeywords: number = 3,
  articleTitle?: string | null,
  selectedKeywords?: Array<{
    keyword: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
  }> | null
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
  
  // 手動選択されたキーワードがある場合はそれを使用、ない場合は自動選定
  let prioritizedKeywords: Array<{
    keyword: string;
    priority: number;
    impressions: number;
    clicks: number;
    position: number;
  }> = [];
  
  let keywordList: Array<{
    keyword: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
  }> = [];
  
  if (selectedKeywords && selectedKeywords.length > 0) {
    // 手動選択されたキーワードを使用（優先度は固定値100を設定）
    prioritizedKeywords = selectedKeywords.map((kw) => ({
      keyword: kw.keyword,
      priority: 100, // 手動選択の場合は優先度を固定
      impressions: kw.impressions,
      clicks: kw.clicks,
      position: kw.position,
    }));
    console.log(`[CompetitorAnalysis] Using manually selected keywords: ${prioritizedKeywords.length}`);
  } else {
    // 自動選定のロジック（既存の処理）
    // keywordData.rowsが存在することを確認
    const keywordRows = Array.isArray(keywordData?.rows) ? keywordData.rows : [];
    keywordList = keywordRows.map((row) => ({
      keyword: row.keys[0],
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
    }));

    // 転落したキーワードを優先
    // 最小インプレッション数の閾値（検索ボリュームが少ないキーワードを除外）
    // データが少ないページでもキーワードを取得できるように、閾値を下げる
    const minImpressions = 1; // 10から1に変更

    // デバッグログ
    console.log(`[CompetitorAnalysis] Keyword data:`, {
      keywordListCount: keywordList.length,
      keywordListSample: keywordList.slice(0, 5).map(kw => ({ keyword: kw.keyword, impressions: kw.impressions, position: kw.position })),
      droppedKeywordsCount: rankDropResult.droppedKeywords.length,
      minImpressions,
    });

    // 転落キーワードと通常キーワードを統合してから、正規化で重複排除
    const allPrioritizedKeywords: typeof prioritizedKeywords = [];

    if (rankDropResult.droppedKeywords.length > 0) {
      // 転落キーワードを優先（意味的に同じキーワードはグループ化）
      const droppedPrioritized = keywordPrioritizer
        .prioritizeDroppedKeywords(rankDropResult.droppedKeywords, maxKeywords * 2, minImpressions, articleTitle)
        .map((kw) => ({
          keyword: kw.keyword,
          priority: kw.priority,
          impressions: kw.impressions,
          clicks: kw.clicks,
          position: kw.position,
        }));
      console.log(`[CompetitorAnalysis] Dropped prioritized:`, droppedPrioritized.length);
      allPrioritizedKeywords.push(...droppedPrioritized);
    }

    // 全体から主要なキーワードを追加（意味的に同じキーワードはグループ化）
    const regularPrioritized = keywordPrioritizer
      .prioritizeKeywords(keywordList, maxKeywords * 2, minImpressions, articleTitle)
      .map((kw) => ({
        keyword: kw.keyword,
        priority: kw.priority,
        impressions: kw.impressions,
        clicks: kw.clicks,
        position: kw.position,
      }));
    console.log(`[CompetitorAnalysis] Regular prioritized:`, regularPrioritized.length);
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
  }

  console.log(`[CompetitorAnalysis] ⏱️ Step 1.3 (Keyword prioritization): ${Date.now() - step3Start}ms`);

  // キーワードが取得できない場合のエラーチェック
  if (prioritizedKeywords.length === 0) {
    const keywordRows = Array.isArray(keywordData?.rows) ? keywordData.rows : [];
    if (keywordRows.length === 0 && !selectedKeywords) {
      throw new Error(
        "このページは過去90日間で検索結果に表示されていないため、キーワードデータが取得できませんでした。\n" +
        "「キーワードを選択」ボタンから手動でキーワードを入力して分析を続行してください。"
      );
    } else if (prioritizedKeywords.length === 0 && selectedKeywords) {
      // 手動選択されたキーワードがあるが、優先キーワードが空の場合は手動選択キーワードを使用
      prioritizedKeywords = selectedKeywords.map((kw) => ({
        keyword: kw.keyword,
        priority: 100,
        impressions: kw.impressions,
        clicks: kw.clicks,
        position: kw.position,
      }));
    }
  }

  // 上位を保てているキーワードを抽出（1-5位）
  // 手動選択の場合はkeywordListが定義されていないので、GSCデータから再取得
  const keywordRowsForTopRanking = Array.isArray(keywordData?.rows) ? keywordData.rows : [];
  const keywordListForTopRanking: Array<{
    keyword: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
  }> = keywordRowsForTopRanking.map((row) => ({
    keyword: row.keys[0],
    position: row.position,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
  }));
  
  const topRankingKeywords = keywordListForTopRanking
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
  // 注意: この時点ではSerper APIの結果はまだ取得していないため、
  // 後でStep 2の結果と統合して転落を検出する必要がある
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
      
      // timeSeriesData.rowsが存在することを確認
      const timeSeriesRows = Array.isArray(timeSeriesData?.rows) ? timeSeriesData.rows : [];
      for (const row of timeSeriesRows) {
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

      // 日付順にソートし、データ欠落を検出
      for (const [keyword, data] of timeSeriesMap.entries()) {
        data.sort((a, b) => a.date.localeCompare(b.date));
        
        // データ欠落の検出と警告フラグの追加
        const lastDataDate = data.length > 0 ? new Date(data[data.length - 1].date) : null;
        const endDateObj = new Date(endDate);
        const daysSinceLastData = lastDataDate 
          ? Math.floor((endDateObj.getTime() - lastDataDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        // 最後のデータから3日以上経過している場合、転落の可能性が高い
        const hasRecentDrop = daysSinceLastData !== null && daysSinceLastData >= 3;
        
        keywordTimeSeries.push({ 
          keyword, 
          data,
          // メタデータを追加（フロントエンドで警告表示に使用）
          metadata: {
            lastDataDate: lastDataDate?.toISOString().split('T')[0] || null,
            daysSinceLastData,
            hasRecentDrop,
            // 最後のデータの順位
            lastPosition: data.length > 0 ? data[data.length - 1].position : null,
          }
        });
      }
      
      // データが全く取得されていないキーワードも追加（警告表示用）
      for (const kw of prioritizedKeywords) {
        if (!timeSeriesMap.has(kw.keyword)) {
          keywordTimeSeries.push({
            keyword: kw.keyword,
            data: [],
            metadata: {
              lastDataDate: null,
              daysSinceLastData: null,
              hasRecentDrop: true, // データが全くない場合は転落とみなす
              lastPosition: kw.position, // キーワードデータから取得した順位
            }
          });
        }
      }
    } catch (error: any) {
      console.error("[CompetitorAnalysis] Failed to get keyword time series data:", error);
      // 時系列データの取得に失敗しても続行
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`[CompetitorAnalysis] ⏱️ Step 1 complete: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  
  // デバッグログ
  console.log(`[CompetitorAnalysis] Step 1 result:`, {
    prioritizedKeywordsCount: prioritizedKeywords.length,
    prioritizedKeywords: prioritizedKeywords.map(kw => ({ keyword: kw.keyword, priority: kw.priority, position: kw.position, impressions: kw.impressions })),
    topRankingKeywordsCount: topRankingKeywords.length,
    keywordTimeSeriesCount: keywordTimeSeries.length,
  });

  return {
    prioritizedKeywords,
    topRankingKeywords: topRankingKeywords.length > 0 ? topRankingKeywords : undefined,
    keywordTimeSeries: keywordTimeSeries.length > 0 ? keywordTimeSeries : undefined,
  };
}

