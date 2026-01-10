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
   * @param missingAIOElements AI検索最適化（AIO対応）で不足している要素
   */
  async generateImprovement(
    articleUrl: string,
    ownArticle: ArticleContent,
    whyCompetitorsRankHigher: string,
    recommendedAdditions: RecommendedAddition[],
    missingAIOElements: string[] = []
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
      recommendedAdditions,
      missingAIOElements
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
    recommendedAdditions: RecommendedAddition[],
    missingAIOElements: string[] = []
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

${missingAIOElements.length > 0 ? `【AI検索最適化（AIO対応）で不足している要素】
以下の要素が不足しています。これらはLLM（AI Overview）に引用されやすいページの特徴です：
${missingAIOElements.map((elem, i) => `${i + 1}. ${elem}`).join('\n')}

これらの要素を追加することで、AI検索結果に表示されやすくなります。特にFAQセクション、要約セクション、データ・統計の提示は重要です。

` : ''}【要件】
1. 既存記事の見出し構造を確認し、適切な位置（既存の見出しの前後）に新しいセクションを追加する形で提案してください
2. 「追加すべき項目」の各項目について、分析結果の「理由」と「内容概要」を元に、既存記事のスタイルやトーンに合わせた具体的で実用的な文章を生成してください
${missingAIOElements.length > 0 ? `3. AI検索最適化（AIO対応）で不足している要素がある場合は、それらも改善提案に含めてください。特にFAQセクション、要約セクション、データ・統計の提示は優先的に追加してください。
4. ` : '3. '}見出し（## または ###）を含む完全なMarkdown形式で出力してください
${missingAIOElements.length > 0 ? '5. ' : '4. '}各項目は独立したセクションとして、そのまま記事に挿入できる形式にしてください
${missingAIOElements.length > 0 ? '6. ' : '5. '}既存記事の内容と自然に統合できるよう、既存の文章スタイルや語調を参考にしてください
${missingAIOElements.length > 0 ? '7. ' : '6. '}自然で読みやすく、検索意図に応える具体的な内容を含めてください
${missingAIOElements.length > 0 ? '8. ' : '7. '}実際にコピペして使用できる完全なMarkdown形式で出力してください
${missingAIOElements.length > 0 ? '9. FAQセクションを追加する場合は、記事の内容に関連する具体的な質問と回答を含めてください\n10. 要約セクションを追加する場合は、記事の主要なポイントを簡潔にまとめてください' : ''}

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
      let jsonText = text.trim();

      // パターン1: ```json ... ``` コードブロックを除去（貪欲マッチングで最後の```まで）
      const jsonBlockStart = jsonText.indexOf('```json');
      if (jsonBlockStart !== -1) {
        // ```jsonの後の位置を取得
        const contentStart = jsonBlockStart + 7; // '```json'.length
        // 最後の```を探す（貪欲マッチング）
        const codeBlockEnd = jsonText.lastIndexOf('```');
        if (codeBlockEnd !== -1 && codeBlockEnd > contentStart) {
          jsonText = jsonText.substring(contentStart, codeBlockEnd).trim();
        } else {
          // 終了マーカーがない場合、```jsonの後から最後まで
          jsonText = jsonText.substring(contentStart).trim();
        }
      } else {
        // パターン2: ``` ... ``` コードブロックを除去
        const codeBlockStart = jsonText.indexOf('```');
        if (codeBlockStart !== -1) {
          const contentStart = codeBlockStart + 3; // '```'.length
          const codeBlockEnd = jsonText.lastIndexOf('```');
          if (codeBlockEnd !== -1 && codeBlockEnd > contentStart) {
            jsonText = jsonText.substring(contentStart, codeBlockEnd).trim();
          } else {
            jsonText = jsonText.substring(contentStart).trim();
          }
        }
      }

      // パターン3: 最初の { から最後の } までを抽出（コードブロックが不完全な場合や、コードブロック除去後もJSONが不完全な場合）
      if (!jsonText.startsWith('{')) {
        const firstBrace = jsonText.indexOf('{');
        if (firstBrace !== -1) {
          // 最後の } を探す（ネストされたオブジェクトに対応）
          let braceCount = 0;
          let lastBrace = -1;
          for (let i = firstBrace; i < jsonText.length; i++) {
            if (jsonText[i] === '{') {
              braceCount++;
            } else if (jsonText[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastBrace = i;
                break;
              }
            }
          }
          
          if (lastBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
          } else {
            // ネストが合わない場合は、単純に最後の}を使う
            const simpleLastBrace = jsonText.lastIndexOf('}');
            if (simpleLastBrace !== -1 && simpleLastBrace > firstBrace) {
              jsonText = jsonText.substring(firstBrace, simpleLastBrace + 1);
            }
          }
        }
      }

      // 最終的なトリム
      jsonText = jsonText.trim();

      // JSONパース
      const parsed = JSON.parse(jsonText);
      
      // バリデーション
      if (!parsed.changes || !Array.isArray(parsed.changes)) {
        throw new Error("Invalid response format: changes array is required");
      }

      return parsed as ArticleImprovementResult;
    } catch (error: any) {
      console.error("[ArticleImprovementGenerator] Failed to parse response:", error);
      console.error("[ArticleImprovementGenerator] Response text (first 500 chars):", text.substring(0, 500));
      console.error("[ArticleImprovementGenerator] Response text (last 500 chars):", text.substring(Math.max(0, text.length - 500)));
      
      // フォールバック: 空の変更を返す
      return {
        changes: [],
      };
    }
  }
}
