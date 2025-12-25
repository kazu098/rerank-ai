import { KeywordData } from "./rank-drop-detection";

export interface PrioritizedKeyword {
  keyword: string;
  priority: number;
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
}

/**
 * キーワードの優先順位付け
 */
export class KeywordPrioritizer {
  /**
   * キーワードを優先順位付けし、主要なキーワードのみを選定
   * @param keywords キーワードデータ
   * @param maxKeywords 選定する最大キーワード数（デフォルト: 5）
   */
  prioritizeKeywords(
    keywords: KeywordData[],
    maxKeywords: number = 5
  ): PrioritizedKeyword[] {
    // 優先順位スコアを計算
    const prioritized = keywords.map((kw) => ({
      keyword: kw.keyword,
      priority: this.calculatePriority(kw),
      impressions: kw.impressions,
      clicks: kw.clicks,
      position: kw.position,
      ctr: kw.ctr,
    }));

    // 優先順位でソート（高い順）
    prioritized.sort((a, b) => b.priority - a.priority);

    // 上位N個を返す
    return prioritized.slice(0, maxKeywords);
  }

  /**
   * 優先順位スコアを計算
   * 考慮要素:
   * - インプレッション数（多いほど重要）
   * - クリック数（多いほど重要）
   * - 順位（低いほど重要、ただし10位以下は優先度を下げる）
   * - CTR（高いほど重要）
   */
  private calculatePriority(keyword: KeywordData): number {
    // インプレッション数のスコア（0-100点）
    const impressionsScore = Math.min(
      (keyword.impressions / 1000) * 50,
      50
    );

    // クリック数のスコア（0-30点）
    const clicksScore = Math.min((keyword.clicks / 100) * 30, 30);

    // 順位のスコア（0-15点）
    // 1-5位: 15点、6-10位: 10点、11-20位: 5点、21位以下: 0点
    let positionScore = 0;
    if (keyword.position <= 5) {
      positionScore = 15;
    } else if (keyword.position <= 10) {
      positionScore = 10;
    } else if (keyword.position <= 20) {
      positionScore = 5;
    }

    // CTRのスコア（0-5点）
    const ctrScore = Math.min(keyword.ctr * 100 * 5, 5);

    return impressionsScore + clicksScore + positionScore + ctrScore;
  }

  /**
   * 転落したキーワードから主要なキーワードを選定
   * 転落キーワードは優先度を上げる
   */
  prioritizeDroppedKeywords(
    droppedKeywords: Array<{
      keyword: string;
      position: number;
      impressions: number;
      clicks: number;
      ctr: number;
    }>,
    maxKeywords: number = 3
  ): PrioritizedKeyword[] {
    // 転落キーワードは優先度を2倍にする
    const prioritized = droppedKeywords.map((kw) => ({
      keyword: kw.keyword,
      priority: this.calculatePriority(kw) * 2, // 転落キーワードは優先度を2倍
      impressions: kw.impressions,
      clicks: kw.clicks,
      position: kw.position,
      ctr: kw.ctr,
    }));

    prioritized.sort((a, b) => b.priority - a.priority);

    return prioritized.slice(0, maxKeywords);
  }

  /**
   * キーワードをグループ化して、代表的なキーワードを選定
   * 類似キーワード（例：「ポケとも 価格」「ポケとも 月額」）を1つにまとめる
   */
  groupAndSelectKeywords(
    keywords: KeywordData[],
    maxGroups: number = 5
  ): PrioritizedKeyword[] {
    // キーワードをグループ化（簡易版：最初の2単語でグループ化）
    const groups = new Map<string, KeywordData[]>();

    for (const kw of keywords) {
      const words = kw.keyword.split(/\s+/);
      const groupKey = words.slice(0, 2).join(" "); // 最初の2単語でグループ化

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(kw);
    }

    // 各グループから代表的なキーワードを選定（優先度が最も高いもの）
    const representatives: PrioritizedKeyword[] = [];

    for (const [groupKey, groupKeywords] of groups.entries()) {
      const prioritized = this.prioritizeKeywords(groupKeywords, 1);
      if (prioritized.length > 0) {
        representatives.push(prioritized[0]);
      }
    }

    // 優先度でソート
    representatives.sort((a, b) => b.priority - a.priority);

    return representatives.slice(0, maxGroups);
  }
}


