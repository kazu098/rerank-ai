import { ArticleContent } from "./article-scraper";

export interface LLMDiffAnalysisResult {
  semanticAnalysis: {
    whyCompetitorsRankHigher: string;
    missingContent: string[];
    recommendedAdditions: Array<{
      section: string;
      reason: string;
      content: string;
      competitorUrls?: string[]; // この内容が記載されている競合サイトのURL（複数可）
    }>;
  };
  keywordSpecificAnalysis: {
    keyword: string;
    whyRankingDropped: string;
    whatToAdd: Array<{
      item: string; // 追加すべき項目
      competitorUrls?: string[]; // この項目が記載されている競合サイトのURL（該当するもののみ）
    }>;
  }[];
}

/**
 * LLM差分分析の抽象化インターフェース
 */
export interface LLMProvider {
  isAvailable(): boolean;
  analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string
  ): Promise<LLMDiffAnalysisResult>;
}

/**
 * LLM差分分析クラス（複数プロバイダー対応）
 */
export class LLMDiffAnalyzer {
  private provider: LLMProvider | null = null;

  constructor() {
    // 環境変数でプロバイダーを選択
    const providerType = process.env.LLM_PROVIDER || "groq"; // デフォルト: Groq

    switch (providerType.toLowerCase()) {
      case "groq":
        this.provider = new GroqLLMProvider();
        break;
      case "openrouter":
        this.provider = new OpenRouterLLMProvider();
        break;
      case "qwen":
        this.provider = new QwenLLMProvider();
        break;
      case "gemini":
        this.provider = new GeminiLLMProvider();
        break;
      default:
        this.provider = new GroqLLMProvider(); // デフォルト
    }
  }

  /**
   * 利用可能かどうかを確認
   */
  static isAvailable(): boolean {
    return (
      GroqLLMProvider.isAvailable() ||
      OpenRouterLLMProvider.isAvailable() ||
      QwenLLMProvider.isAvailable() ||
      GeminiLLMProvider.isAvailable()
    );
  }

  /**
   * 意味レベルの差分分析を実行
   */
  async analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): Promise<LLMDiffAnalysisResult> {
    if (!this.provider || !this.provider.isAvailable()) {
      throw new Error("No LLM provider is available. Please set LLM_API_KEY or GEMINI_API_KEY");
    }

    return await this.provider.analyzeSemanticDiff(
      keyword,
      ownArticle,
      competitorArticles,
      locale
    );
  }
}

/**
 * Groq LLMプロバイダー（無料枠あり、高速）
 */
class GroqLLMProvider implements LLMProvider {
  private apiKey: string | null = null;
  private baseUrl = "https://api.groq.com/openai/v1/chat/completions";

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || null;
  }

  static isAvailable(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

  isAvailable(): boolean {
    return GroqLLMProvider.isAvailable();
  }

  async analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): Promise<LLMDiffAnalysisResult> {
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }

    const prompt = this.buildPrompt(keyword, ownArticle, competitorArticles, locale);
    const isEnglish = locale === "en";
    const languageInstruction = isEnglish 
      ? "Analyze the differences between articles and provide recommendations in English."
      : "記事の違いを分析し、日本語で推奨事項を提供してください。";

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
          body: JSON.stringify({
          model: "llama-3.1-70b-versatile", // または "mixtral-8x7b-32768", "llama-3.3-70b-versatile"
          messages: [
            {
              role: "system",
              content: `You are an SEO content analysis expert. ${languageInstruction} Always respond in valid JSON format.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Groq API Error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content;

      if (!text) {
        throw new Error("No response from Groq API");
      }

      return this.parseResponse(text);
    } catch (error: any) {
      console.error("[GroqLLMProvider] Error:", error);
      throw error;
    }
  }

  private buildPrompt(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): string {
    const isEnglish = locale === "en";
    
    const competitorSummaries = competitorArticles
      .map(
        (comp, index) => isEnglish
          ? `
Competitor Article ${index + 1}:
- URL: ${comp.url}
- Title: ${comp.title}
- Word Count: ${comp.wordCount} characters
- Heading Structure:
${comp.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- Main Paragraphs (first 3):
${comp.paragraphs
  .slice(0, 3)
  .map((p) => `  ${p.substring(0, 200)}...`)
  .join("\n\n")}
`
          : `
競合記事${index + 1}:
- URL: ${comp.url}
- タイトル: ${comp.title}
- 文字数: ${comp.wordCount}文字
- 見出し構造:
${comp.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- 主要な段落（最初の3つ）:
${comp.paragraphs
  .slice(0, 3)
  .map((p) => `  ${p.substring(0, 200)}...`)
  .join("\n\n")}
`
      )
      .join("\n");

    if (isEnglish) {
      return `You are an SEO content analysis expert. Please analyze and compare your company's article with competitor articles for the search keyword "${keyword}".

## Your Company's Article
- URL: ${ownArticle.url}
- Title: ${ownArticle.title}
- Word Count: ${ownArticle.wordCount} characters
- Heading Structure:
${ownArticle.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- Main Paragraphs (first 5):
${ownArticle.paragraphs
  .slice(0, 5)
  .map((p) => `  ${p.substring(0, 200)}...`)
  .join("\n\n")}

## Competitor Articles (Top ${competitorArticles.length} sites)
${competitorSummaries}

## Analysis Tasks
1. **Why competitors rank higher**: Analyze why competitor articles rank higher for the search keyword "${keyword}".
2. **Missing content**: List specific content that is missing from your company's article.
3. **Recommended additions**: Specifically suggest sections or content that should be added to your company's article to meet the search intent for the keyword "${keyword}". For each item, include the URLs of competitor articles where this content is found (use an empty array if no competitor articles are applicable).

**Important**: 
- The whatToAdd in keywordSpecificAnalysis should list specific items tailored to the search keyword.
- Each item must accurately reflect the **actual content** found in competitor articles. Do not speculate about formats (e.g., "comparison table") that are not actually present in competitor articles.
- Example: "Listing of Poketomo device price, monthly fee, and initial cost" - reflect the actual content as it appears.
- For each item, include the URLs of competitor articles where this content is found.

## Output Format (JSON)
Please output in the following JSON format:

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
        "content": "Overview of content to add (2-3 sentences)",
        "competitorUrls": [
          "URL of competitor article where this content is found (only applicable ones)"
        ]
      }
    ]
  },
  "keywordSpecificAnalysis": [
    {
      "keyword": "${keyword}",
      "whyRankingDropped": "Why ranking dropped for this keyword (2-3 sentences)",
      "whatToAdd": [
        {
          "item": "Item to add 1 (content tailored to search keyword. Accurately reflect actual content found in competitor articles. Do not speculate about formats)",
          "competitorUrls": ["URL of competitor article where this item is found (only applicable ones)"]
        },
        {
          "item": "Item to add 2 (content tailored to search keyword. Accurately reflect actual content found in competitor articles)",
          "competitorUrls": []
        }
      ]
    }
  ]
}`;
    }

    return `あなたはSEOコンテンツ分析の専門家です。検索キーワード「${keyword}」で、自社記事と競合記事を比較分析してください。

## 自社記事
- URL: ${ownArticle.url}
- タイトル: ${ownArticle.title}
- 文字数: ${ownArticle.wordCount}文字
- 見出し構造:
${ownArticle.headings.map((h) => `  H${h.level}: ${h.text}`).join("\n")}
- 主要な段落（最初の5つ）:
${ownArticle.paragraphs
  .slice(0, 5)
  .map((p) => `  ${p.substring(0, 200)}...`)
  .join("\n\n")}

## 競合記事（上位${competitorArticles.length}サイト）
${competitorSummaries}

## 分析タスク
1. **なぜ競合が上位なのか**: 検索キーワード「${keyword}」で競合記事が上位にランクインしている理由を分析してください。
2. **不足している内容**: 自社記事に不足している内容を具体的に箇条書きで提示してください。
3. **追加すべき項目**: 検索キーワード「${keyword}」の検索意図に応えるために、自社記事に追加すべきセクションや内容を具体的に提示してください。各項目について、その内容が記載されている競合記事のURLも含めてください（該当する競合記事がない場合は空配列にしてください）。

**重要**: 
- keywordSpecificAnalysisのwhatToAddは、検索キーワードに特化した具体的な追加項目を箇条書きで提示してください。
- 各項目は、競合記事に**実際に記載されている内容**を正確に反映してください。競合記事に記載されていない形式（例：「比較表」など）を勝手に推測しないでください。
- 例：「ポケトモの本体価格、月額料金、初期費用の記載」のように、実際に記載されている内容をそのまま反映してください。
- 各項目について、その内容が記載されている競合記事のURLも含めてください。

## 出力形式（JSON）
以下のJSON形式で出力してください：

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
        "content": "追加すべき内容の概要（2-3文）",
        "competitorUrls": [
          "この内容が記載されている競合記事のURL（該当するもののみ）"
        ]
      }
    ]
  },
  "keywordSpecificAnalysis": [
    {
      "keyword": "${keyword}",
      "whyRankingDropped": "なぜこのキーワードで順位が下がったか（2-3文）",
      "whatToAdd": [
        {
          "item": "追加すべき項目1（検索キーワードに特化した内容。競合記事に実際に記載されている内容を正確に反映すること。形式を勝手に推測しない）",
          "competitorUrls": ["この項目が記載されている競合記事のURL（該当するもののみ）"]
        },
        {
          "item": "追加すべき項目2（検索キーワードに特化した内容。競合記事に実際に記載されている内容を正確に反映すること）",
          "competitorUrls": []
        }
      ]
    }
  ]
}`;
  }

  private parseResponse(text: string): LLMDiffAnalysisResult {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text.trim();

      const parsed = JSON.parse(jsonText);
      return parsed as LLMDiffAnalysisResult;
    } catch (error: any) {
      console.error("[GroqLLMProvider] Failed to parse response:", error);
      throw new Error(`Failed to parse Groq API response: ${error.message}`);
    }
  }
}

/**
 * OpenRouter LLMプロバイダー（複数モデル対応、無料枠あり）
 */
class OpenRouterLLMProvider implements LLMProvider {
  private apiKey: string | null = null;
  private baseUrl = "https://openrouter.ai/api/v1/chat/completions";

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || null;
  }

  static isAvailable(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }

  isAvailable(): boolean {
    return OpenRouterLLMProvider.isAvailable();
  }

  async analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): Promise<LLMDiffAnalysisResult> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const prompt = this.buildPrompt(keyword, ownArticle, competitorArticles, locale);
    const isEnglish = locale === "en";
    const languageInstruction = isEnglish 
      ? "Analyze the differences between articles and provide recommendations in English."
      : "記事の違いを分析し、日本語で推奨事項を提供してください。";

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "ReRank AI",
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5", // 無料モデル、または "qwen/qwen-2.5-72b-instruct"
          messages: [
            {
              role: "system",
              content: `You are an SEO content analysis expert. ${languageInstruction} Always respond in valid JSON format.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API Error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content;

      if (!text) {
        throw new Error("No response from OpenRouter API");
      }

      return this.parseResponse(text);
    } catch (error: any) {
      console.error("[OpenRouterLLMProvider] Error:", error);
      throw error;
    }
  }

  private buildPrompt(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): string {
    // Groqと同じプロンプトを使用
    return new GroqLLMProvider()["buildPrompt"](keyword, ownArticle, competitorArticles, locale);
  }

  private parseResponse(text: string): LLMDiffAnalysisResult {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text.trim();

      const parsed = JSON.parse(jsonText);
      return parsed as LLMDiffAnalysisResult;
    } catch (error: any) {
      console.error("[OpenRouterLLMProvider] Failed to parse response:", error);
      throw new Error(`Failed to parse OpenRouter API response: ${error.message}`);
    }
  }
}

/**
 * Qwen LLMプロバイダー（Alibaba Cloud、無料枠あり）
 */
class QwenLLMProvider implements LLMProvider {
  private apiKey: string | null = null;
  private baseUrl = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";

  constructor() {
    this.apiKey = process.env.QWEN_API_KEY || null;
  }

  static isAvailable(): boolean {
    return !!process.env.QWEN_API_KEY;
  }

  isAvailable(): boolean {
    return QwenLLMProvider.isAvailable();
  }

  async analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): Promise<LLMDiffAnalysisResult> {
    if (!this.apiKey) {
      throw new Error("QWEN_API_KEY is not set");
    }

    const prompt = this.buildPrompt(keyword, ownArticle, competitorArticles, locale);
    const isEnglish = locale === "en";
    const languageInstruction = isEnglish 
      ? "Analyze the differences between articles and provide recommendations in English."
      : "記事の違いを分析し、日本語で推奨事項を提供してください。";

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen-turbo", // または "qwen-plus", "qwen-max"
          input: {
            messages: [
              {
                role: "system",
                content: `You are an SEO content analysis expert. ${languageInstruction} Always respond in valid JSON format.`,
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          parameters: {
            temperature: 0.7,
            result_format: "message",
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Qwen API Error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      const text = data.output?.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error("No response from Qwen API");
      }

      return this.parseResponse(text);
    } catch (error: any) {
      console.error("[QwenLLMProvider] Error:", error);
      throw error;
    }
  }

  private buildPrompt(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): string {
    // Groqと同じプロンプトを使用
    return new GroqLLMProvider()["buildPrompt"](keyword, ownArticle, competitorArticles, locale);
  }

  private parseResponse(text: string): LLMDiffAnalysisResult {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text.trim();

      const parsed = JSON.parse(jsonText);
      return parsed as LLMDiffAnalysisResult;
    } catch (error: any) {
      console.error("[QwenLLMProvider] Failed to parse response:", error);
      throw new Error(`Failed to parse Qwen API response: ${error.message}`);
    }
  }
}

/**
 * Gemini LLMプロバイダー（既存実装との互換性）
 */
class GeminiLLMProvider implements LLMProvider {
  private genAI: any = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        this.genAI = new GoogleGenerativeAI(apiKey);
      } catch (error) {
        console.error("[GeminiLLMProvider] Failed to initialize:", error);
      }
    }
  }

  static isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  isAvailable(): boolean {
    return GeminiLLMProvider.isAvailable() && this.genAI !== null;
  }

  async analyzeSemanticDiff(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): Promise<LLMDiffAnalysisResult> {
    if (!this.genAI) {
      throw new Error("GEMINI_API_KEY is not set or failed to initialize");
    }

    // 環境変数でモデルを選択可能（デフォルト: gemini-2.0-flash-lite）
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const model = this.genAI.getGenerativeModel({ model: modelName });
    const prompt = this.buildPrompt(keyword, ownArticle, competitorArticles, locale);

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return this.parseResponse(text);
    } catch (error: any) {
      console.error("[GeminiLLMProvider] Error:", error);
      throw error;
    }
  }

  private buildPrompt(
    keyword: string,
    ownArticle: ArticleContent,
    competitorArticles: ArticleContent[],
    locale: string = "ja"
  ): string {
    return new GroqLLMProvider()["buildPrompt"](keyword, ownArticle, competitorArticles, locale);
  }

  private parseResponse(text: string): LLMDiffAnalysisResult {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text.trim();

      const parsed = JSON.parse(jsonText);
      return parsed as LLMDiffAnalysisResult;
    } catch (error: any) {
      console.error("[GeminiLLMProvider] Failed to parse response:", error);
      throw new Error(`Failed to parse Gemini API response: ${error.message}`);
    }
  }
}

