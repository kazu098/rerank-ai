import { auth } from "@/lib/auth";

interface GSCQueryParams {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  dimensionFilterGroups?: any[];
  rowLimit?: number;
  startRow?: number;
}

interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCResponse {
  rows: GSCRow[];
  responseAggregationType: string;
}

/**
 * Google Search Console APIクライアント
 */
export class GSCApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * 特定記事の時系列データを取得
   */
  async getPageTimeSeriesData(
    siteUrl: string,
    pageUrl: string,
    startDate: string,
    endDate: string
  ): Promise<GSCResponse> {
    const params: GSCQueryParams = {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 1000,
    };

    return this.query(siteUrl, params, pageUrl);
  }

  /**
   * キーワード（クエリ）ごとの順位データを取得
   */
  async getKeywordData(
    siteUrl: string,
    pageUrl: string,
    startDate: string,
    endDate: string
  ): Promise<GSCResponse> {
    const params: GSCQueryParams = {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 1000,
    };

    return this.query(siteUrl, params, pageUrl);
  }

  /**
   * キーワードの時系列データを取得（グラフ用）
   * date + queryのdimensionsで取得
   */
  async getKeywordTimeSeriesData(
    siteUrl: string,
    pageUrl: string,
    startDate: string,
    endDate: string,
    keywords?: string[] // 特定のキーワードのみ取得する場合
  ): Promise<GSCResponse> {
    const params: GSCQueryParams = {
      startDate,
      endDate,
      dimensions: ["date", "query"],
      rowLimit: 10000, // 時系列データは多めに取得
    };

    // 特定のキーワードのみ取得する場合のフィルタ
    if (keywords && keywords.length > 0) {
      params.dimensionFilterGroups = [
        {
          filters: keywords.map((keyword) => ({
            dimension: "query",
            expression: keyword,
            operator: "equals",
          })),
          groupType: "or",
        },
      ];
    }

    return this.query(siteUrl, params, pageUrl);
  }

  /**
   * GSC APIにクエリを送信
   */
  private async query(
    siteUrl: string,
    params: GSCQueryParams,
    pageUrl?: string
  ): Promise<GSCResponse> {
    // サイトURLの正規化
    // sc-domain:で始まるドメインプロパティは末尾にスラッシュを付けない
    // https://で始まるURLプロパティは末尾にスラッシュを追加
    let normalizedSiteUrl: string;
    if (siteUrl.startsWith("sc-domain:")) {
      // ドメインプロパティの場合、末尾のスラッシュを削除
      normalizedSiteUrl = siteUrl.replace(/\/$/, "");
    } else {
      // URLプロパティの場合、末尾にスラッシュを追加
      normalizedSiteUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
    }
    // OAuth Playgroundの形式: /sites/https%3A%2F%2Fmia-cat.com%2F/searchAnalytics/query
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      normalizedSiteUrl
    )}/searchAnalytics/query`;

    const requestBody: any = {
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: params.dimensions || [],
      rowLimit: params.rowLimit || 1000,
    };

    if (pageUrl) {
      // ページURLが相対パスの場合、完全なURL形式に変換
      let normalizedPageUrl = pageUrl;
      if (pageUrl.startsWith("/")) {
        // sc-domain:の場合は、https://形式に変換してから結合
        if (normalizedSiteUrl.startsWith("sc-domain:")) {
          const domain = normalizedSiteUrl.replace("sc-domain:", "");
          normalizedPageUrl = `https://${domain}${pageUrl}`;
        } else {
          // URLプロパティの場合、末尾のスラッシュを削除して結合
          const siteUrlWithoutSlash = normalizedSiteUrl.replace(/\/$/, "");
          normalizedPageUrl = `${siteUrlWithoutSlash}${pageUrl}`;
        }
      }
      
      requestBody.dimensionFilterGroups = [
        {
          filters: [
            {
              dimension: "page",
              operator: "equals",
              expression: normalizedPageUrl,
            },
          ],
        },
      ];
    }

    // デバッグログ（本番環境では削除推奨）
    console.log("[GSC API] Request:", {
      siteUrl: normalizedSiteUrl,
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: params.dimensions,
      pageUrl: pageUrl ? (requestBody.dimensionFilterGroups?.[0]?.filters?.[0]?.expression || pageUrl) : undefined,
      rowLimit: params.rowLimit || 1000,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[GSC API] Error response:", {
        status: response.status,
        statusText: response.statusText,
        error,
      });
      throw new Error(
        `GSC API Error: ${response.status} ${response.statusText} - ${JSON.stringify(error)}`
      );
    }

    const data = await response.json();
    // デバッグログ（本番環境では削除推奨）
    console.log("[GSC API] Response:", {
      rowsCount: data?.rows?.length || 0,
      responseAggregationType: data?.responseAggregationType,
      hasRows: !!data?.rows,
    });
    return data;
  }

  /**
   * アクセストークンをリフレッシュ
   * 注意: 実際の実装では、Google OAuth 2.0のリフレッシュトークンを使用する必要があります
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    // TODO: リフレッシュトークンを使用してアクセストークンを更新
    // 現在はNextAuth.jsが自動的に処理するため、実装は後で追加
    throw new Error("Token refresh not implemented yet");
  }
}

/**
 * 認証済みセッションからGSC APIクライアントを取得
 */
export async function getGSCClient() {
  const session = await auth();
  if (!session?.accessToken) {
    throw new Error(
      "認証が必要です。Googleアカウントでログインしてください。\n" +
      "Not authenticated or access token not available. Please sign in with your Google account."
    );
  }
  return new GSCApiClient(session.accessToken);
}

