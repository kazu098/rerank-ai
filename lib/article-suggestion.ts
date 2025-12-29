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
   * 既にGSC形式（sc-domain:またはhttps://）の場合はそのまま返す
   */
  private normalizeSiteUrl(input: string): string {
    // 既にGSC形式の場合はそのまま返す
    if (input.startsWith("sc-domain:") || input.startsWith("https://") || input.startsWith("http://")) {
      return input;
    }

    try {
      // URLかドメインかを判定
      const url = input.startsWith("http") ? input : `https://${input}`;
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, "");

      // まずURL形式を試す（ユーザーが登録している形式を優先）
      return `https://${domain}/`;
    } catch {
      // URLパースに失敗した場合、そのまま返す
      return input;
    }
  }

  /**
   * ドメイン全体のキーワードを取得（ページネーション対応）
   * サイトURL形式が無効な場合は、代替形式を試す
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
    let triedAlternativeFormat = false;
    let currentSiteUrl = siteUrl;

    while (hasMore) {
      try {
        const keywordData = await client.getAllKeywords(
          currentSiteUrl,
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
      } catch (error: any) {
        // 403エラーで、まだ代替形式を試していない場合
        if (error.message?.includes("403") && !triedAlternativeFormat) {
          triedAlternativeFormat = true;
          
          // URL形式とsc-domain形式を切り替える
          if (currentSiteUrl.startsWith("https://")) {
            const domain = currentSiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
            currentSiteUrl = `sc-domain:${domain}`;
            console.log(`[ArticleSuggestion] Trying alternative format: ${currentSiteUrl}`);
            startRow = 0; // リセット
            continue; // リトライ
          } else if (currentSiteUrl.startsWith("sc-domain:")) {
            const domain = currentSiteUrl.replace("sc-domain:", "");
            currentSiteUrl = `https://${domain}/`;
            console.log(`[ArticleSuggestion] Trying alternative format: ${currentSiteUrl}`);
            startRow = 0; // リセット
            continue; // リトライ
          }
        }
        
        // エラーを再スロー
        throw error;
      }
    }

    return allKeywords;
  }

  /**
   * 既存記事のキーワードカバレッジを分析
   * タイトルとURLからキーワードを抽出（日本語対応）
   */
  private analyzeCoverage(articles: Article[]): Set<string> {
    const coveredKeywords = new Set<string>();

    for (const article of articles) {
      // タイトルからキーワードを抽出
      if (article.title) {
        const normalizedTitle = this.keywordPrioritizer.normalizeKeyword(article.title);
        
        // タイトル全体を正規化して追加（部分一致チェック用）
        coveredKeywords.add(normalizedTitle);

        // 括弧内の読み方も抽出（例：「aibo（アイボ）」から「aibo」と「アイボ」の両方を抽出）
        const bracketMatches = article.title.match(/[（(]([^）)]+)[）)]/g);
        if (bracketMatches) {
          for (const match of bracketMatches) {
            const content = match.replace(/[（()）]/g, "");
            const normalized = this.keywordPrioritizer.normalizeKeyword(content);
            if (normalized.length > 1) {
              coveredKeywords.add(normalized);
            }
          }
        }

        // 括弧前の部分も抽出（例：「aibo（アイボ）」から「aibo」を抽出）
        const beforeBracket = article.title.split(/[（(]/)[0];
        if (beforeBracket) {
          const normalized = this.keywordPrioritizer.normalizeKeyword(beforeBracket);
          if (normalized.length > 1) {
            coveredKeywords.add(normalized);
          }
        }

        // スペース、記号、括弧などで分割して単語を抽出
        const words = article.title
          .toLowerCase()
          .replace(/[（(].*?[）)]/g, " ") // 括弧内をスペースに変換（除去ではなく）
          .replace(/[・、。！？：；]/g, " ") // 日本語の句読点をスペースに変換
          .split(/\s+|「|」|『|』|【|】/)
          .map((word) => word.trim())
          .filter((word) => word.length > 1); // 1文字の単語は除外

        // 単語を追加
        for (const word of words) {
          const normalized = this.keywordPrioritizer.normalizeKeyword(word);
          if (normalized.length > 1) {
            coveredKeywords.add(normalized);
          }
        }

        // 2語の組み合わせ（スペース区切りの場合）
        for (let i = 0; i < words.length - 1; i++) {
          const combined = `${words[i]} ${words[i + 1]}`;
          const normalized = this.keywordPrioritizer.normalizeKeyword(combined);
          if (normalized.length > 2) {
            coveredKeywords.add(normalized);
          }
        }

        // 3語の組み合わせ
        for (let i = 0; i < words.length - 2; i++) {
          const combined = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
          const normalized = this.keywordPrioritizer.normalizeKeyword(combined);
          if (normalized.length > 3) {
            coveredKeywords.add(normalized);
          }
        }
      }

      // URLからもキーワードを抽出（例：/aibo/ や /romi/ など）
      if (article.url) {
        try {
          const urlObj = new URL(article.url);
          const pathParts = urlObj.pathname
            .split("/")
            .filter((part) => part.length > 1)
            .map((part) => part.toLowerCase());

          for (const part of pathParts) {
            const normalized = this.keywordPrioritizer.normalizeKeyword(part);
            if (normalized.length > 1) {
              coveredKeywords.add(normalized);
            }
          }
        } catch {
          // URLパースに失敗した場合は無視
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

      // 既存記事でカバーされているかチェック
      // 1. 完全一致
      let isCovered = coveredKeywords.has(normalizedKeyword);
      
      if (!isCovered) {
        // 2. キーワードの各部分がカバーされているかチェック
        // 例：「aibo ロボット」の場合、「aibo」がカバーされていれば除外
        const keywordParts = normalizedKeyword.split(/\s+/).filter((part) => part.length > 2);
        for (const part of keywordParts) {
          if (coveredKeywords.has(part)) {
            isCovered = true;
            break;
          }
        }
      }

      if (!isCovered) {
        // 3. タイトルにキーワードが含まれているかチェック（部分一致）
        for (const covered of coveredKeywords) {
          // キーワードがタイトルに含まれている、またはタイトルがキーワードに含まれている
          if (normalizedKeyword.includes(covered) || covered.includes(normalizedKeyword)) {
            // ただし、短すぎる単語（2文字以下）の部分一致は無視
            if (normalizedKeyword.length > 2 && covered.length > 2) {
              isCovered = true;
              break;
            }
          }
        }
      }

      // 既存記事でカバーされていないキーワード
      const isNotCovered = !isCovered;

      // インプレッション数が一定以上（10以上）
      const hasEnoughImpressions = keyword.impressions >= 10;

      // 順位が低い（20位以下）または未表示（position > 100）
      const isLowRanking = keyword.position > 20;

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
   * タイトル案を生成（LLM使用）
   */
  private async generateTitles(
    clusters: KeywordCluster[],
    existingArticles: Article[]
  ): Promise<ArticleSuggestion[]> {
    // LLMが利用可能な場合は使用
    if (process.env.GEMINI_API_KEY) {
      try {
        return await this.generateTitlesWithLLM(clusters, existingArticles);
      } catch (error) {
        console.error("[ArticleSuggestion] LLM generation failed, using fallback:", error);
      }
    }

    // LLMが利用できない場合はフォールバック
    return this.generateTitlesFallback(clusters, existingArticles);
  }

  /**
   * LLMを使用してタイトル案を生成
   */
  private async generateTitlesWithLLM(
    clusters: KeywordCluster[],
    existingArticles: Article[]
  ): Promise<ArticleSuggestion[]> {
    const topClusters = clusters.slice(0, 10);

    // 既存記事のタイトルを取得
    const existingTitles = existingArticles
      .filter((a) => a.title)
      .map((a) => a.title!)
      .slice(0, 20); // 最大20件

    // キーワードクラスター情報を準備
    const clusterInfo = topClusters.map((cluster) => ({
      keywords: cluster.keywords.map((kw) => kw.keyword).slice(0, 10),
      representativeKeyword: cluster.representativeKeyword,
      impressions: cluster.totalImpressions,
      averagePosition: cluster.averagePosition,
    }));

    // プロンプトを構築
    const prompt = this.buildLLMPrompt(clusterInfo, existingTitles);

    try {
      // Gemini APIを直接呼び出す
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
      }

      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // レスポンスからタイトルを抽出
      const titles = this.parseLLMResponse(text);

      // タイトルが生成できた場合は使用、できなかった場合はフォールバック
      if (titles.length > 0 && titles.length === topClusters.length) {
        return topClusters.map((cluster, index) => ({
          title: titles[index] || cluster.representativeKeyword,
          keywords: cluster.keywords.map((kw) => kw.keyword),
          reason: `インプレッション数: ${cluster.totalImpressions.toLocaleString()}、平均順位: ${cluster.averagePosition.toFixed(1)}位`,
          estimatedImpressions: cluster.totalImpressions,
          priority: Math.floor(cluster.totalImpressions / 100),
        }));
      }
    } catch (error) {
      console.error("[ArticleSuggestion] LLM generation failed, using fallback:", error);
    }

    // フォールバック
    return this.generateTitlesFallback(clusters, existingArticles);
  }

  /**
   * LLMプロンプトを構築
   */
  private buildLLMPrompt(
    clusters: Array<{
      keywords: string[];
      representativeKeyword: string;
      impressions: number;
      averagePosition: number;
    }>,
    existingTitles: string[]
  ): string {
    return `あなたはSEOコンテンツ戦略の専門家です。

以下の情報を基に、新規記事のタイトルを${clusters.length}個提案してください。

## キーワードクラスター情報
${clusters
  .map(
    (cluster, index) => `
${index + 1}. 代表キーワード: ${cluster.representativeKeyword}
   - 関連キーワード: ${cluster.keywords.slice(0, 5).join(", ")}
   - インプレッション数: ${cluster.impressions.toLocaleString()}
   - 平均順位: ${cluster.averagePosition.toFixed(1)}位`
  )
  .join("\n")}

## 既存記事のタイトル例
${existingTitles.length > 0 ? existingTitles.slice(0, 10).join("\n") : "（既存記事なし）"}

## 要件
1. 各キーワードクラスターに対して、自然で魅力的な記事タイトルを1つずつ提案してください
2. タイトルは30文字以内で、検索意図に合った内容にしてください
3. 既存記事のタイトルパターンと一貫性を保ってください
4. SEO効果が期待できるタイトルにしてください

## 出力形式
以下の形式で、タイトルのみを${clusters.length}行で出力してください（番号は不要）:
タイトル1
タイトル2
タイトル3
...`;
  }

  /**
   * LLMレスポンスをパース
   */
  private parseLLMResponse(response: string): string[] {
    // 行ごとに分割して、空行や番号を除去
    const lines = response
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !/^\d+[\.\)]/.test(line)) // 番号付きの行を除去
      .filter((line) => !line.startsWith("タイトル"))
      .slice(0, 10);

    return lines;
  }

  /**
   * フォールバック: シンプルなタイトル生成（LLMなし）
   */
  private generateTitlesFallback(
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
        priority: Math.floor(cluster.totalImpressions / 100),
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

