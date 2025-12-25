import { SearchResult } from "./competitor-extractor";

export interface SerperSearchResult {
  title: string;
  link: string;
  position: number;
}

export interface SerperApiResponse {
  organic: SerperSearchResult[];
  totalResults?: number;
}

/**
 * Serper APIクライアント
 * Google検索結果を取得するためのAPI
 */
export class SerperApiClient {
  private apiKey: string;
  // SerpApiのエンドポイント（Serper APIではなくSerpApiを使用）
  private baseUrl = "https://google.serper.dev/search";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SERPER_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("SERPER_API_KEY is not set");
    }
  }

  /**
   * Google検索を実行し、検索結果を取得
   * @param keyword 検索キーワード
   * @param location 検索地域（デフォルト: 日本）
   * @param num 取得する検索結果数（デフォルト: 10）
   */
  async search(
    keyword: string,
    location: string = "Japan",
    num: number = 10
  ): Promise<SearchResult[]> {
    try {
      // Serper.dev APIはPOSTリクエストで、JSONボディとして送信
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: keyword,
          location: location,
          num: num,
          hl: "ja",
          gl: "jp",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Serper API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data: any = await response.json();

      // Serper.dev APIのレスポンス形式に合わせる
      // Serper.devは `organic` フィールドを使用
      const organicResults = data.organic || [];

      // SearchResult形式に変換
      const results: SearchResult[] = organicResults.map((item: any, index: number) => ({
        url: item.link || item.url,
        title: item.title,
        position: index + 1,
      }));

      return results;
    } catch (error: any) {
      console.error(`[SerperApi] Error searching for "${keyword}":`, error);
      throw error;
    }
  }

  /**
   * 利用可能かどうかを確認
   */
  static isAvailable(): boolean {
    return !!process.env.SERPER_API_KEY;
  }
}

