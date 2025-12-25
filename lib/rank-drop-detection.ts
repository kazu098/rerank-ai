import { GSCApiClient } from "./gsc-api";

export interface RankDropResult {
  hasDrop: boolean;
  dropAmount: number;
  baseAveragePosition: number;
  currentAveragePosition: number;
  baseDate: string;
  currentDate: string;
  droppedKeywords: DroppedKeyword[];
  analysisTargetKeywords: string[];
}

export interface DroppedKeyword {
  keyword: string;
  position: number;
  previousPosition?: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface KeywordData {
  keyword: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

/**
 * 順位下落検知ロジック
 */
export class RankDropDetector {
  private client: GSCApiClient;

  constructor(client: GSCApiClient) {
    this.client = client;
  }

  /**
   * 順位下落を検知
   * @param siteUrl サイトURL
   * @param pageUrl ページURL
   * @param comparisonDays 比較期間（デフォルト: 7日）
   * @param dropThreshold 急落の閾値（デフォルト: 2位）
   * @param keywordDropThreshold キーワード転落の閾値（デフォルト: 10位）
   */
  async detectRankDrop(
    siteUrl: string,
    pageUrl: string,
    comparisonDays: number = 7,
    dropThreshold: number = 2,
    keywordDropThreshold: number = 10
  ): Promise<RankDropResult> {
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(
      Date.now() - (comparisonDays + 2) * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0];

    // 時系列データを取得
    const timeSeriesData = await this.client.getPageTimeSeriesData(
      siteUrl,
      pageUrl,
      startDate,
      endDate
    );

    // 過去N日間の平均順位を計算
    const baseAveragePosition = this.calculateAveragePosition(
      timeSeriesData.rows,
      comparisonDays
    );

    // 現在（直近）の平均順位を計算
    const currentAveragePosition = this.calculateAveragePosition(
      timeSeriesData.rows,
      1
    );

    const dropAmount = currentAveragePosition - baseAveragePosition;

    // キーワードデータを取得
    const keywordData = await this.client.getKeywordData(
      siteUrl,
      pageUrl,
      startDate,
      endDate
    );

    // 転落したキーワードを特定
    const droppedKeywords = this.identifyDroppedKeywords(
      keywordData.rows,
      keywordDropThreshold
    );

    // 分析対象のキーワードを選定
    const analysisTargetKeywords = this.selectAnalysisTargets(
      droppedKeywords,
      dropAmount,
      dropThreshold
    );

    return {
      hasDrop:
        dropAmount >= dropThreshold || droppedKeywords.length > 0,
      dropAmount,
      baseAveragePosition,
      currentAveragePosition,
      baseDate: startDate,
      currentDate: endDate,
      droppedKeywords,
      analysisTargetKeywords,
    };
  }

  /**
   * 平均順位を計算
   */
  private calculateAveragePosition(
    rows: Array<{
      keys: string[];
      position: number;
      impressions: number;
      clicks: number;
      ctr: number;
    }>,
    days: number
  ): number {
    if (rows.length === 0) return 0;

    // 直近N日間のデータを取得
    const recentRows = rows.slice(-days);
    if (recentRows.length === 0) return 0;

    // インプレッション数で重み付けした平均順位を計算
    let totalWeightedPosition = 0;
    let totalImpressions = 0;

    for (const row of recentRows) {
      totalWeightedPosition += row.position * row.impressions;
      totalImpressions += row.impressions;
    }

    return totalImpressions > 0
      ? totalWeightedPosition / totalImpressions
      : 0;
  }

  /**
   * 転落したキーワードを特定
   */
  private identifyDroppedKeywords(
    keywordRows: Array<{
      keys: string[];
      position: number;
      impressions: number;
      clicks: number;
      ctr: number;
    }>,
    threshold: number
  ): DroppedKeyword[] {
    return keywordRows
      .filter((row) => row.position >= threshold)
      .map((row) => ({
        keyword: row.keys[0],
        position: row.position,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
      }))
      .sort((a, b) => b.impressions - a.impressions); // インプレッション数でソート
  }

  /**
   * 分析対象のキーワードを選定
   */
  private selectAnalysisTargets(
    droppedKeywords: DroppedKeyword[],
    dropAmount: number,
    dropThreshold: number
  ): string[] {
    // 急落が検知された場合、転落したキーワードを優先
    if (dropAmount >= dropThreshold && droppedKeywords.length > 0) {
      // インプレッション数が多い上位3つのキーワードを選定
      return droppedKeywords
        .slice(0, 3)
        .map((keyword) => keyword.keyword);
    }

    // 急落が検知されない場合でも、転落したキーワードがあれば選定
    if (droppedKeywords.length > 0) {
      return droppedKeywords
        .slice(0, 3)
        .map((keyword) => keyword.keyword);
    }

    return [];
  }
}

