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
   * 意味的に同じキーワードはグループ化して、代表的なキーワードのみを選定
   * @param keywords キーワードデータ
   * @param maxKeywords 選定する最大キーワード数（デフォルト: 5）
   * @param minImpressions 最小インプレッション数（デフォルト: 10）
   */
  prioritizeKeywords(
    keywords: KeywordData[],
    maxKeywords: number = 5,
    minImpressions: number = 10
  ): PrioritizedKeyword[] {
    // インプレッション数の閾値でフィルタリング
    const filteredKeywords = keywords.filter((kw) => kw.impressions >= minImpressions);

    // 意味的に同じキーワードをグループ化
    const groups = new Map<string, KeywordData[]>();
    
    for (const kw of filteredKeywords) {
      const normalizedKey = this.normalizeKeyword(kw.keyword);
      
      if (!groups.has(normalizedKey)) {
        groups.set(normalizedKey, []);
      }
      groups.get(normalizedKey)!.push(kw);
    }

    // 各グループから代表的なキーワードを選定（優先度が最も高いもの）
    const representatives: PrioritizedKeyword[] = [];

    for (const [normalizedKey, groupKeywords] of groups.entries()) {
      // グループ内で優先度スコアを計算
      const prioritized = groupKeywords.map((kw) => ({
        keyword: kw.keyword,
        priority: this.calculatePriority(kw, minImpressions),
        impressions: kw.impressions,
        clicks: kw.clicks,
        position: kw.position,
        ctr: kw.ctr,
      }));

      // 優先度が最も高いキーワードを代表として選定
      prioritized.sort((a, b) => b.priority - a.priority);
      if (prioritized.length > 0 && prioritized[0].priority > 0) {
        representatives.push(prioritized[0]);
      }
    }

    // 優先順位でソート（高い順）
    representatives.sort((a, b) => b.priority - a.priority);

    // 上位N個を返す
    return representatives.slice(0, maxKeywords);
  }

  /**
   * キーワードを正規化（意味的に同じキーワードを統一）
   * 例：「ポケとも 価格」と「ポケ とも 価格」を同じキーワードとして扱う
   * 
   * 正規化ルール:
   * - 全角スペースを半角スペースに変換
   * - 連続する空白を1つに統一
   * - 前後の空白を削除
   * - 大文字小文字を統一（小文字に）
   * 
   * @public 他のクラスからも使用可能にする
   */
  normalizeKeyword(keyword: string): string {
    return keyword
      .replace(/　/g, " ") // 全角スペースを半角スペースに
      .replace(/\s+/g, " ") // 連続する空白を1つに統一
      .trim() // 前後の空白を削除
      .toLowerCase(); // 小文字に統一
  }

  /**
   * キーワードが意味的に同じかどうかを判定
   * 正規化後の文字列が同じなら意味的に同じとみなす
   */
  private areKeywordsSimilar(keyword1: string, keyword2: string): boolean {
    return this.normalizeKeyword(keyword1) === this.normalizeKeyword(keyword2);
  }

  /**
   * 優先順位スコアを計算
   * 考慮要素:
   * - インプレッション数（多いほど重要）
   * - クリック数（多いほど重要）
   * - 順位（低いほど重要、ただし10位以下は優先度を下げる）
   * - CTR（高いほど重要）
   * 
   * @param minImpressions 最小インプレッション数（これ未満のキーワードは優先度0を返す）
   */
  private calculatePriority(keyword: KeywordData, minImpressions: number = 10): number {
    // インプレッション数が少ないキーワードは除外（検索ボリュームが少ない）
    if (keyword.impressions < minImpressions) {
      return 0;
    }
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
   * 意味的に同じキーワードはグループ化して、代表的なキーワードのみを選定
   */
  prioritizeDroppedKeywords(
    droppedKeywords: Array<{
      keyword: string;
      position: number;
      impressions: number;
      clicks: number;
      ctr: number;
    }>,
    maxKeywords: number = 3,
    minImpressions: number = 10
  ): PrioritizedKeyword[] {
    // インプレッション数の閾値でフィルタリング
    const filteredKeywords = droppedKeywords.filter((kw) => kw.impressions >= minImpressions);

    // 意味的に同じキーワードをグループ化
    const groups = new Map<string, typeof droppedKeywords>();
    
    for (const kw of filteredKeywords) {
      const normalizedKey = this.normalizeKeyword(kw.keyword);
      
      if (!groups.has(normalizedKey)) {
        groups.set(normalizedKey, []);
      }
      groups.get(normalizedKey)!.push(kw);
    }

    // 各グループから代表的なキーワードを選定（優先度が最も高いもの）
    const representatives: PrioritizedKeyword[] = [];

    for (const [normalizedKey, groupKeywords] of groups.entries()) {
      // グループ内で優先度スコアを計算（転落キーワードは2倍）
      const prioritized = groupKeywords.map((kw) => ({
        keyword: kw.keyword,
        priority: this.calculatePriority(kw, minImpressions) * 2, // 転落キーワードは優先度を2倍
        impressions: kw.impressions,
        clicks: kw.clicks,
        position: kw.position,
        ctr: kw.ctr,
      }));

      // 優先度が最も高いキーワードを代表として選定
      prioritized.sort((a, b) => b.priority - a.priority);
      if (prioritized.length > 0 && prioritized[0].priority > 0) {
        representatives.push(prioritized[0]);
      }
    }

    // 優先順位でソート（高い順）
    representatives.sort((a, b) => b.priority - a.priority);

    return representatives.slice(0, maxKeywords);
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


