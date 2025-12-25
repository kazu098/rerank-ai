import { ArticleContent } from "./article-scraper";

export interface DiffAnalysisResult {
  ownArticle: ArticleContent;
  competitorArticles: ArticleContent[];
  missingHeadings: Array<{
    heading: string;
    level: number;
    foundIn: string[]; // どの競合記事に含まれているか
  }>;
  missingKeywords: Array<{
    keyword: string;
    frequency: number; // 競合記事での出現頻度
    foundIn: string[]; // どの競合記事に含まれているか
  }>;
  wordCountDiff: {
    own: number;
    average: number;
    diff: number;
  };
  recommendations: string[]; // 箇条書きの推奨事項
}

/**
 * 差分分析クラス
 * 自社記事と競合記事を比較し、差分を特定
 */
export class DiffAnalyzer {
  /**
   * 自社記事と競合記事を比較分析
   */
  analyze(
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[]
  ): DiffAnalysisResult {
    // 見出しの差分を分析
    const missingHeadings = this.findMissingHeadings(
      ownArticle,
      competitorArticles
    );

    // キーワードの差分を分析
    const missingKeywords = this.findMissingKeywords(
      ownArticle,
      competitorArticles
    );

    // 文字数の差分を分析
    const wordCountDiff = this.calculateWordCountDiff(
      ownArticle,
      competitorArticles
    );

    // 推奨事項を生成
    const recommendations = this.generateRecommendations(
      missingHeadings,
      missingKeywords,
      wordCountDiff
    );

    return {
      ownArticle,
      competitorArticles,
      missingHeadings,
      missingKeywords,
      wordCountDiff,
      recommendations,
    };
  }

  /**
   * 見出しの差分を特定
   */
  private findMissingHeadings(
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[]
  ): Array<{ heading: string; level: number; foundIn: string[] }> {
    const ownHeadings = new Set(
      ownArticle.headings.map((h) => this.normalizeText(h.text))
    );

    const missingHeadings: Array<{
      heading: string;
      level: number;
      foundIn: string[];
    }> = [];

    // 各競合記事の見出しをチェック
    competitorArticles.forEach((competitor) => {
      competitor.headings.forEach((heading) => {
        const normalizedHeading = this.normalizeText(heading.text);
        if (!ownHeadings.has(normalizedHeading)) {
          // 既にリストにあるかチェック
          const existing = missingHeadings.find(
            (m) => m.heading === heading.text
          );
          if (existing) {
            if (!existing.foundIn.includes(competitor.url)) {
              existing.foundIn.push(competitor.url);
            }
          } else {
            missingHeadings.push({
              heading: heading.text,
              level: heading.level,
              foundIn: [competitor.url],
            });
          }
        }
      });
    });

    // 複数の競合記事に含まれる見出しを優先
    return missingHeadings
      .sort((a, b) => b.foundIn.length - a.foundIn.length)
      .slice(0, 10); // 上位10個に限定
  }

  /**
   * キーワードの差分を特定
   */
  private findMissingKeywords(
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[]
  ): Array<{ keyword: string; frequency: number; foundIn: string[] }> {
    const ownText = this.normalizeText(ownArticle.fullText);
    const ownKeywords = this.extractKeywords(ownText);

    // 競合記事からキーワードを抽出
    const competitorKeywords: Map<
      string,
      { frequency: number; foundIn: Set<string> }
    > = new Map();

    competitorArticles.forEach((competitor) => {
      const competitorText = this.normalizeText(competitor.fullText);
      const keywords = this.extractKeywords(competitorText);

      keywords.forEach((keyword) => {
        if (!ownKeywords.has(keyword)) {
          const existing = competitorKeywords.get(keyword);
          if (existing) {
            existing.frequency++;
            existing.foundIn.add(competitor.url);
          } else {
            competitorKeywords.set(keyword, {
              frequency: 1,
              foundIn: new Set([competitor.url]),
            });
          }
        }
      });
    });

    // 頻度順にソート
    const missingKeywords = Array.from(competitorKeywords.entries())
      .map(([keyword, data]) => ({
        keyword,
        frequency: data.frequency,
        foundIn: Array.from(data.foundIn),
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20); // 上位20個に限定

    return missingKeywords;
  }

  /**
   * 文字数の差分を計算
   */
  private calculateWordCountDiff(
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[]
  ): { own: number; average: number; diff: number } {
    const own = ownArticle.wordCount;
    const average =
      competitorArticles.reduce((sum, c) => sum + c.wordCount, 0) /
      competitorArticles.length;
    const diff = average - own;

    return { own, average: Math.round(average), diff: Math.round(diff) };
  }

  /**
   * 推奨事項を生成
   */
  private generateRecommendations(
    missingHeadings: Array<{ heading: string; level: number; foundIn: string[] }>,
    missingKeywords: Array<{ keyword: string; frequency: number; foundIn: string[] }>,
    wordCountDiff: { own: number; average: number; diff: number }
  ): string[] {
    const recommendations: string[] = [];

    // 見出しに関する推奨事項
    if (missingHeadings.length > 0) {
      const topHeadings = missingHeadings
        .slice(0, 5)
        .map((h) => `「${h.heading}」`)
        .join("、");
      recommendations.push(
        `複数の競合記事に含まれている見出しを追加: ${topHeadings}`
      );
    }

    // キーワードに関する推奨事項
    if (missingKeywords.length > 0) {
      const topKeywords = missingKeywords
        .slice(0, 5)
        .map((k) => k.keyword)
        .join("、");
      recommendations.push(
        `競合記事で頻繁に使用されているキーワードを追加: ${topKeywords}`
      );
    }

    // 文字数に関する推奨事項
    if (wordCountDiff.diff > 500) {
      recommendations.push(
        `記事の文字数を増やす（現在: ${wordCountDiff.own}文字、競合平均: ${wordCountDiff.average}文字、差: ${wordCountDiff.diff}文字）`
      );
    }

    return recommendations;
  }

  /**
   * テキストを正規化（比較用）
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "")
      .trim();
  }

  /**
   * キーワードを抽出（日本語対応）
   */
  private extractKeywords(text: string): Set<string> {
    const keywords = new Set<string>();

    // 日本語の単語を抽出（2文字以上）
    const japaneseWords = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{2,}/g);
    if (japaneseWords) {
      japaneseWords.forEach((word) => {
        if (word.length >= 2 && word.length <= 10) {
          keywords.add(word);
        }
      });
    }

    // 英語の単語を抽出（3文字以上）
    const englishWords = text.match(/\b[a-zA-Z]{3,}\b/g);
    if (englishWords) {
      englishWords.forEach((word) => {
        keywords.add(word.toLowerCase());
      });
    }

    return keywords;
  }
}

