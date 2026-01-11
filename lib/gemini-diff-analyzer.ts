import { GoogleGenerativeAI } from "@google/generative-ai";
import { ArticleContent } from "./article-scraper";

export interface GeminiDiffAnalysisResult {
  semanticAnalysis: {
    whyCompetitorsRankHigher: string; // なぜ競合が上位なのか
    missingContent: string[]; // 不足している内容（箇条書き）
    recommendedAdditions: Array<{
      section: string; // 追加すべきセクション名
      reason: string; // なぜ追加すべきか
      content: string; // 追加すべき内容の概要
    }>;
  };
  keywordSpecificAnalysis: {
    keyword: string;
    whyRankingDropped: string; // なぜ順位が下がったか
    whatToAdd: string[]; // 追加すべき項目（箇条書き）
  }[];
}

/**
 * Gemini APIを使った意味レベルの差分分析
 */
export class GeminiDiffAnalyzer {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * 利用可能かどうかを確認
   */
  static isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  /**
   * 意味レベルの差分分析を実行
   * @param keyword 検索キーワード
   * @param ownArticle 自社記事
   * @param competitorArticles 競合記事
   * @param locale ロケール（'ja' | 'en'）
   */
  async analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): Promise<GeminiDiffAnalysisResult> {
    if (!this.genAI) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    // Gemini 2.0 Flash Exp または Gemini 1.5 Flash を使用
    const model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp" 
    });

    // プロンプトを構築
    const prompt = this.buildPrompt(keyword, ownArticle, competitorArticles, locale);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // JSON形式でパース
      const analysis = this.parseResponse(text);

      return {
        semanticAnalysis: analysis.semanticAnalysis,
        keywordSpecificAnalysis: analysis.keywordSpecificAnalysis,
      };
    } catch (error: any) {
      console.error("[GeminiDiffAnalyzer] Error analyzing:", error);
      throw new Error(`Failed to analyze with Gemini: ${error.message}`);
    }
  }

  /**
   * プロンプトを構築
   */
  private buildPrompt(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): string {
    const isEnglish = locale === "en";
    
    const competitorSummaries = competitorArticles.map((comp, index) => isEnglish
      ? `
Competitor Article ${index + 1}:
- URL: ${comp.url}
- Title: ${comp.title}
- Word Count: ${comp.wordCount} characters
- Heading Structure:
${comp.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- Main Paragraphs (first 3):
${comp.paragraphs.slice(0, 3).map((p) => `  ${p.substring(0, 200)}...`).join("\n\n")}
`
      : `
競合記事${index + 1}:
- URL: ${comp.url}
- タイトル: ${comp.title}
- 文字数: ${comp.wordCount}文字
- 見出し構造:
${comp.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- 主要な段落（最初の3つ）:
${comp.paragraphs.slice(0, 3).map((p) => `  ${p.substring(0, 200)}...`).join("\n\n")}
`
    ).join("\n");

    if (isEnglish) {
      return `You are an SEO content analysis expert. Please analyze and compare your company's article with competitor articles for the search keyword "${keyword}".

## Your Company's Article
- URL: ${ownArticle.url}
- Title: ${ownArticle.title}
- Word Count: ${ownArticle.wordCount} characters
- Heading Structure:
${ownArticle.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- Main Paragraphs (first 5):
${ownArticle.paragraphs.slice(0, 5).map((p) => `  ${p.substring(0, 200)}...`).join("\n\n")}

## Competitor Articles (Top ${competitorArticles.length} sites)
${competitorSummaries}

## Analysis Tasks
1. **Why competitors rank higher**: Analyze why competitor articles rank higher for the search keyword "${keyword}".
2. **Missing content**: List specific content that is missing from your company's article.
3. **Recommended additions**: Specifically suggest sections or content that should be added to your company's article to meet the search intent for the keyword "${keyword}".

## Output Format (JSON)
Please output in the following JSON format:

\`\`\`json
{
  "semanticAnalysis": {
    "whyCompetitorsRankHigher": "Reason why competitors rank higher (explain in 2-3 sentences)",
    "missingContent": [
      "Missing content 1 (be specific)",
      "Missing content 2 (be specific)",
      "Missing content 3 (be specific)"
    ],
    "recommendedAdditions": [
      {
        "section": "Section name to add (e.g., Price Comparison Table)",
        "reason": "Why it should be added (relevance to search intent)",
        "content": "Overview of content to add (2-3 sentences)"
      }
    ]
  },
  "keywordSpecificAnalysis": [
    {
      "keyword": "${keyword}",
      "whyRankingDropped": "Why ranking dropped for this keyword (2-3 sentences)",
      "whatToAdd": [
        "Item to add 1 (content tailored to search keyword)",
        "Item to add 2 (content tailored to search keyword)"
      ]
    }
  ]
}
\`\`\`

Important: Output only JSON, do not include any explanatory text.`;
    }

    return `あなたはSEOコンテンツ分析の専門家です。検索キーワード「${keyword}」で、自社記事と競合記事を比較分析してください。

## 自社記事
- URL: ${ownArticle.url}
- タイトル: ${ownArticle.title}
- 文字数: ${ownArticle.wordCount}文字
- 見出し構造:
${ownArticle.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- 主要な段落（最初の5つ）:
${ownArticle.paragraphs.slice(0, 5).map((p) => `  ${p.substring(0, 200)}...`).join("\n\n")}

## 競合記事（上位${competitorArticles.length}サイト）
${competitorSummaries}

## 分析タスク
1. **なぜ競合が上位なのか**: 検索キーワード「${keyword}」で競合記事が上位にランクインしている理由を分析してください。
2. **不足している内容**: 自社記事に不足している内容を具体的に箇条書きで提示してください。
3. **追加すべき項目**: 検索キーワード「${keyword}」の検索意図に応えるために、自社記事に追加すべきセクションや内容を具体的に提示してください。

## 出力形式（JSON）
以下のJSON形式で出力してください：

\`\`\`json
{
  "semanticAnalysis": {
    "whyCompetitorsRankHigher": "競合が上位な理由（2-3文で説明）",
    "missingContent": [
      "不足している内容1（具体的に）",
      "不足している内容2（具体的に）",
      "不足している内容3（具体的に）"
    ],
    "recommendedAdditions": [
      {
        "section": "追加すべきセクション名（例：価格比較表）",
        "reason": "なぜ追加すべきか（検索意図との関連性）",
        "content": "追加すべき内容の概要（2-3文）"
      }
    ]
  },
  "keywordSpecificAnalysis": [
    {
      "keyword": "${keyword}",
      "whyRankingDropped": "なぜこのキーワードで順位が下がったか（2-3文）",
      "whatToAdd": [
        "追加すべき項目1（検索キーワードに特化した内容）",
        "追加すべき項目2（検索キーワードに特化した内容）"
      ]
    }
  ]
}
\`\`\`

重要: JSONのみを出力し、説明文は含めないでください。`;
  }

  /**
   * レスポンスをパース
   */
  private parseResponse(text: string): GeminiDiffAnalysisResult {
    try {
      // JSONコードブロックを除去
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text.trim();

      const parsed = JSON.parse(jsonText);
      return parsed as GeminiDiffAnalysisResult;
    } catch (error: any) {
      console.error("[GeminiDiffAnalyzer] Failed to parse response:", error);
      console.error("[GeminiDiffAnalyzer] Response text:", text);
      
      // フォールバック: 基本的な構造を返す
      return {
        semanticAnalysis: {
          whyCompetitorsRankHigher: "分析に失敗しました。",
          missingContent: [],
          recommendedAdditions: [],
        },
        keywordSpecificAnalysis: [],
      };
    }
  }
}

