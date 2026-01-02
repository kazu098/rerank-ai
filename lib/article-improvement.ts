import { GoogleGenerativeAI } from "@google/generative-ai";
import { ArticleContent } from "./article-scraper";

/**
 * 記事改善案の変更点
 */
export interface ArticleImprovementChange {
  type: "insert";
  position: "after" | "before";
  target: string; // 既存の見出し（例: "## emoとは？"）
  content: string; // 追加する完全なMarkdown形式の内容（見出しを含む）
  simpleFormat: {
    section: string; // 追加するセクションの見出し
    position: string; // 既存の見出しの後/前
    content: string; // Markdown形式の本文
  };
}

/**
 * 記事改善案の結果
 */
export interface ArticleImprovementResult {
  changes: ArticleImprovementChange[];
}

/**
 * 追加すべき項目の情報
 */
export interface RecommendedAddition {
  section: string;
  reason: string;
  content: string;
  competitorUrls?: string[];
}

/**
 * 記事改善案生成クラス
 */
export class ArticleImprovementGenerator {
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
   * 記事改善案を生成
   * @param articleUrl 記事のURL
   * @param ownArticle 自社記事の全文
   * @param whyCompetitorsRankHigher なぜ競合が上位なのか
   * @param recommendedAdditions 追加すべき項目
   */
  async generateImprovement(
    articleUrl: string,
    ownArticle: ArticleContent,
    whyCompetitorsRankHigher: string,
    recommendedAdditions: RecommendedAddition[]
  ): Promise<ArticleImprovementResult> {
    if (!this.genAI) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    // Gemini 2.0 Flash Liteを使用（コスト削減）
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const model = this.genAI.getGenerativeModel({ model: modelName });

    // プロンプトを構築
    const prompt = this.buildPrompt(
      articleUrl,
      ownArticle,
      whyCompetitorsRankHigher,
      recommendedAdditions
    );

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // JSON形式でパース
      const improvement = this.parseResponse(text);

      return improvement;
    } catch (error: any) {
      console.error("[ArticleImprovementGenerator] Error generating improvement:", error);
      throw new Error(`Failed to generate improvement: ${error.message}`);
    }
  }

  /**
   * プロンプトを構築
   */
  private buildPrompt(
    articleUrl: string,
    ownArticle: ArticleContent,
    whyCompetitorsRankHigher: string,
    recommendedAdditions: RecommendedAddition[]
  ): string {
    // 既存記事の見出し一覧
    const ownHeadingsList = ownArticle.headings
      .map((h) => `${"#".repeat(h.level)} ${h.text}`)
      .join("\n");

    // 既存記事の全文（context windowを考慮して最初の3000文字程度に制限）
    const ownArticleFullText = ownArticle.fullText.substring(0, 3000);

    const additionsList = recommendedAdditions
      .map((add, i) => {
        let text = `${i + 1}. セクション名: ${add.section}\n`;
        text += `   理由: ${add.reason}\n`;
        text += `   内容概要: ${add.content}\n`;
        if (add.competitorUrls && add.competitorUrls.length > 0) {
          text += `   参考URL: ${add.competitorUrls.join(", ")}\n`;
        }
        return text;
      })
      .join("\n\n");

    return `あなたはSEO記事の改善専門家です。
既存記事の内容と分析結果に基づいて、実際にコピペできる改善記事の文章（変更部分のみ）を生成してください。

【既存記事】
- URL: ${articleUrl}
- タイトル: ${ownArticle.title}
- 見出し構造:
${ownHeadingsList}
- 記事の内容（最初の3000文字）:
${ownArticleFullText}

【なぜ競合が上位なのか（分析結果）】
${whyCompetitorsRankHigher}

【追加すべき項目（分析結果）】
${additionsList}

【要件】
1. 既存記事の見出し構造を確認し、適切な位置（既存の見出しの前後）に新しいセクションを追加する形で提案してください
2. 「追加すべき項目」の各項目について、分析結果の「理由」と「内容概要」を元に、既存記事のスタイルやトーンに合わせた具体的で実用的な文章を生成してください
3. 見出し（## または ###）を含む完全なMarkdown形式で出力してください
4. 各項目は独立したセクションとして、そのまま記事に挿入できる形式にしてください
5. 既存記事の内容と自然に統合できるよう、既存の文章スタイルや語調を参考にしてください
6. 自然で読みやすく、検索意図に応える具体的な内容を含めてください
7. 実際にコピペして使用できる完全なMarkdown形式で出力してください

【出力形式】
以下のJSON形式で変更点を出力してください：
{
  "changes": [
    {
      "type": "insert",
      "position": "after" | "before",
      "target": "既存の見出し（例: '## emoとは？'）",
      "content": "追加する完全なMarkdown形式の内容（見出しを含む）",
      "simpleFormat": {
        "section": "追加するセクションの見出し",
        "position": "既存の見出しの後/前",
        "content": "Markdown形式の本文"
      }
    }
  ]
}

例:
{
  "changes": [
    {
      "type": "insert",
      "position": "after",
      "target": "## emoとは？",
      "content": "## 日本語音声コマンド一覧\\n\\nemoロボットが理解できる日本語音声コマンドを、機能別に分類して一覧で提示します。\\n\\n### 基本操作\\n\\n- 「emo、写真撮って」: 写真を撮影します\\n- 「emo、ダンスして」: ダンスを開始します\\n...",
      "simpleFormat": {
        "section": "日本語音声コマンド一覧",
        "position": "## emoとは？の後",
        "content": "emoロボットが理解できる日本語音声コマンドを、機能別に分類して一覧で提示します。\\n\\n### 基本操作\\n\\n- 「emo、写真撮って」: 写真を撮影します\\n- 「emo、ダンスして」: ダンスを開始します\\n..."
      }
    }
  ]
}

重要: 
- JSONのみを出力し、説明文は含めないでください
- 各項目について、分析結果の「理由」と「内容概要」を元に、具体的で実用的な文章を生成してください
- 見出し（##）を含む完全なMarkdown形式で出力してください
- 改行は\\nで表現してください`;
  }

  /**
   * レスポンスをパース
   */
  private parseResponse(text: string): ArticleImprovementResult {
    try {
      // JSONコードブロックを除去
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text.trim();

      const parsed = JSON.parse(jsonText);
      
      // バリデーション
      if (!parsed.changes || !Array.isArray(parsed.changes)) {
        throw new Error("Invalid response format: changes array is required");
      }

      return parsed as ArticleImprovementResult;
    } catch (error: any) {
      console.error("[ArticleImprovementGenerator] Failed to parse response:", error);
      console.error("[ArticleImprovementGenerator] Response text:", text);
      
      // フォールバック: 空の変更を返す
      return {
        changes: [],
      };
    }
  }
}
