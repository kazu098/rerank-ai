import { getGSCClient, GSCApiClient } from "./gsc-api";
import { KeywordPrioritizer } from "./keyword-prioritizer";
import { Article } from "./db/articles";
import { GSCRow } from "./gsc-api";

/**
 * キーワードギャップデータ
 */
export interface KeywordGap {
  keyword: string;
  impressions: number;
  position: number;
  clicks: number;
  ctr: number;
}

/**
 * キーワードクラスター
 */
export interface KeywordCluster {
  keywords: KeywordGap[];
  representativeKeyword: string;
  totalImpressions: number;
  averagePosition: number;
}

/**
 * 記事提案
 */
export interface ArticleSuggestion {
  title: string;
  keywords: string[];
  outline?: string[];
  reason: string;
  estimatedImpressions: number;
  priority: number;
}

/**
 * 記事提案生成クラス
 */
export class ArticleSuggestionGenerator {
  private keywordPrioritizer: KeywordPrioritizer;

  constructor() {
    this.keywordPrioritizer = new KeywordPrioritizer();
  }

  /**
   * URLからドメインを抽出してGSC形式に変換
   */
  private normalizeSiteUrl(input: string): string {
    try {
      // URLかドメインかを判定
      const url = input.startsWith("http") ? input : `https://${input}`;
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, "");

      // GSC APIの形式に変換
      // sc-domain:形式を優先（ドメインプロパティ）
      return `sc-domain:${domain}`;
    } catch {
      // URLパースに失敗した場合、そのまま返す（既にGSC形式の可能性）
      return input;
    }
  }

  /**
   * ドメイン全体のキーワードを取得（ページネーション対応）
   */
  private async getAllKeywords(
    client: GSCApiClient,
    siteUrl: string,
    startDate: string,
    endDate: string
  ): Promise<KeywordGap[]> {
    const allKeywords: KeywordGap[] = [];
    const rowLimit = 25000; // GSC APIの最大値
    let startRow = 0;
    let hasMore = true;

    while (hasMore) {
      const keywordData = await client.getAllKeywords(
        siteUrl,
        startDate,
        endDate,
        rowLimit,
        startRow
      );

      const keywords: KeywordGap[] = (keywordData.rows || []).map((row: GSCRow) => ({
        keyword: row.keys[0],
        impressions: row.impressions,
        position: row.position,
        clicks: row.clicks,
        ctr: row.ctr,
      }));

      allKeywords.push(...keywords);

      // 次のページがあるかチェック
      if (keywords.length < rowLimit) {
        hasMore = false;
      } else {
        startRow += rowLimit;
      }
    }

    return allKeywords;
  }

  /**
   * 既存記事のキーワードカバレッジを分析
   * タイトルからキーワードを抽出（フェーズ1）
   */
  private analyzeCoverage(articles: Article[]): Set<string> {
    const coveredKeywords = new Set<string>();

    for (const article of articles) {
      if (article.title) {
        // タイトルを単語分割してキーワードを抽出
        const words = article.title
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 1); // 1文字の単語は除外

        // 単語と2-3語の組み合わせを抽出
        for (const word of words) {
          coveredKeywords.add(word);
        }

        // 2語の組み合わせ
        for (let i = 0; i < words.length - 1; i++) {
          coveredKeywords.add(`${words[i]} ${words[i + 1]}`);
        }

        // 3語の組み合わせ
        for (let i = 0; i < words.length - 2; i++) {
          coveredKeywords.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
        }
      }

      // DBに保存されているキーワードも追加
      if (article.keywords && Array.isArray(article.keywords)) {
        for (const keyword of article.keywords) {
          coveredKeywords.add(this.keywordPrioritizer.normalizeKeyword(keyword));
        }
      }
    }

    return coveredKeywords;
  }

  /**
   * ギャップキーワードを特定
   * インプレッション数が多いが、順位が低い（20位以下）キーワードを抽出
   */
  private identifyGaps(
    allKeywords: KeywordGap[],
    coveredKeywords: Set<string>
  ): KeywordGap[] {
    const gaps: KeywordGap[] = [];

    for (const keyword of allKeywords) {
      const normalizedKeyword = this.keywordPrioritizer.normalizeKeyword(
        keyword.keyword
      );

      // 既存記事でカバーされていないキーワード
      const isNotCovered = !coveredKeywords.has(normalizedKeyword);

      // インプレッション数が一定以上（10以上）
      const hasEnoughImpressions = keyword.impressions >= 10;

      // 順位が低い（20位以下）または未表示（position > 100）
      const isLowRanking = keyword.position > 20 || keyword.position > 100;

      if (isNotCovered && hasEnoughImpressions && isLowRanking) {
        gaps.push(keyword);
      }
    }

    return gaps;
  }

  /**
   * キーワードをクラスタリング
   * 類似キーワードをグループ化
   */
  private clusterKeywords(gaps: KeywordGap[]): KeywordCluster[] {
    // キーワードを最初の2単語でグループ化
    const groups = new Map<string, KeywordGap[]>();

    for (const gap of gaps) {
      const words = gap.keyword.split(/\s+/);
      const groupKey = words.slice(0, 2).join(" "); // 最初の2単語でグループ化

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(gap);
    }

    // 各グループから代表的なキーワードを選定
    const clusters: KeywordCluster[] = [];

    for (const [groupKey, groupKeywords] of groups.entries()) {
      // 優先度が最も高いキーワードを代表として選定
      const prioritized = this.keywordPrioritizer.prioritizeKeywords(
        groupKeywords,
        1,
        10
      );

      if (prioritized.length > 0) {
        const representative = prioritized[0];
        const totalImpressions = groupKeywords.reduce(
          (sum, kw) => sum + kw.impressions,
          0
        );
        const averagePosition =
          groupKeywords.reduce((sum, kw) => sum + kw.position, 0) /
          groupKeywords.length;

        clusters.push({
          keywords: groupKeywords,
          representativeKeyword: representative.keyword,
          totalImpressions,
          averagePosition,
        });
      }
    }

    // 総インプレッション数でソート（高い順）
    clusters.sort((a, b) => b.totalImpressions - a.totalImpressions);

    return clusters;
  }

  /**
   * タイトル案を生成（LLMなし、フェーズ1）
   */
  private generateTitles(
    clusters: KeywordCluster[],
    existingArticles: Article[]
  ): ArticleSuggestion[] {
    const suggestions: ArticleSuggestion[] = [];

    // 既存記事のタイトルパターンを分析
    const titlePatterns: string[] = [];
    for (const article of existingArticles) {
      if (article.title) {
        titlePatterns.push(article.title);
      }
    }

    // 上位10個のクラスターからタイトル案を生成
    const topClusters = clusters.slice(0, 10);

    for (const cluster of topClusters) {
      // 代表キーワードからタイトルを生成
      const title = this.generateTitleFromKeyword(
        cluster.representativeKeyword,
        titlePatterns
      );

      suggestions.push({
        title,
        keywords: cluster.keywords.map((kw) => kw.keyword),
        reason: `インプレッション数: ${cluster.totalImpressions.toLocaleString()}、平均順位: ${cluster.averagePosition.toFixed(1)}位`,
        estimatedImpressions: cluster.totalImpressions,
        priority: Math.floor(cluster.totalImpressions / 100), // インプレッション数を100で割った値を優先度とする
      });
    }

    return suggestions;
  }

  /**
   * キーワードからタイトルを生成
   */
  private generateTitleFromKeyword(
    keyword: string,
    titlePatterns: string[]
  ): string {
    // シンプルなタイトル生成（フェーズ1）
    // 既存記事のタイトルパターンを参考にする
    if (titlePatterns.length > 0) {
      // 既存記事のタイトルに「〜とは」「〜の方法」などのパターンがあるかチェック
      const hasPattern = titlePatterns.some(
        (pattern) =>
          pattern.includes("とは") ||
          pattern.includes("の方法") ||
          pattern.includes("ガイド") ||
          pattern.includes("完全")
      );

      if (hasPattern) {
        // パターンがある場合、キーワードに「とは」を追加
        return `${keyword}とは`;
      }
    }

    // デフォルト: キーワードをそのまま使用
    return keyword;
  }

  /**
   * 記事提案を生成
   */
  async generateSuggestions(
    siteUrl: string,
    userId: string,
    siteId: string,
    existingArticles: Article[]
  ): Promise<ArticleSuggestion[]> {
    // 1. サイトURLを正規化
    const normalizedSiteUrl = this.normalizeSiteUrl(siteUrl);

    // 2. GSCクライアントを取得
    const client = await getGSCClient();

    // 3. 日付範囲を設定（過去90日間）
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // 4. ドメイン全体のキーワードを取得
    const allKeywords = await this.getAllKeywords(
      client,
      normalizedSiteUrl,
      startDate,
      endDate
    );

    // 5. 既存記事のキーワードカバレッジを分析
    const coveredKeywords = this.analyzeCoverage(existingArticles);

    // 6. ギャップキーワードを特定
    const gaps = this.identifyGaps(allKeywords, coveredKeywords);

    // 7. キーワードクラスタリング
    const clusters = this.clusterKeywords(gaps);

    // 8. タイトル案を生成（LLMなし、フェーズ1）
    const suggestions = this.generateTitles(clusters, existingArticles);

    return suggestions;
  }
}

