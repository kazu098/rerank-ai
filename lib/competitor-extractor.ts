import { chromium, Browser, Page, BrowserContext } from "playwright";
import { SerperApiClient } from "./serper-api";
import { getErrorMessage } from "./api-helpers";

export interface SearchResult {
  url: string;
  title: string;
  position: number;
}

export interface CompetitorExtractionResult {
  competitors: SearchResult[];
  ownPosition?: number;
  totalResults: number;
}

/**
 * 競合URL抽出クラス
 */
export class CompetitorExtractor {
  private browser: Browser | null = null;
  private serperClient: SerperApiClient | null = null;
  private userAgents: string[] = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  ];
  private currentUserAgentIndex = 0;

  /**
   * ブラウザを初期化
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-web-security",
      ],
    });
  }

  /**
   * ブラウザコンテキストを作成（User-Agentを設定）
   */
  private async createContext(): Promise<BrowserContext> {
    const userAgent = this.getNextUserAgent();
    return await this.browser!.newContext({
      userAgent: userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      // Automation検出を回避
      extraHTTPHeaders: {
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
  }

  /**
   * ブラウザを閉じる
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 次のユーザーエージェントを取得（ローテーション）
   */
  private getNextUserAgent(): string {
    const userAgent = this.userAgents[this.currentUserAgentIndex];
    this.currentUserAgentIndex =
      (this.currentUserAgentIndex + 1) % this.userAgents.length;
    return userAgent;
  }

  /**
   * Google検索を実行し、競合URLを取得
   * @param keyword 検索キーワード
   * @param ownUrl 自社URL（順位を特定するため）
   * @param maxCompetitors 取得する競合URLの最大数（デフォルト: 10、自社が100位以下の場合の上限）
   * @param retryCount リトライ回数（デフォルト: 3）
   */
  async extractCompetitors(
    keyword: string,
    ownUrl: string,
    maxCompetitors: number = 10,
    retryCount: number = 5, // CAPTCHA対策のため、リトライ回数を増やす
    preferSerperApi: boolean = false, // 手動スキャン時はSerper.devを優先（速度重視）
    isManualScan: boolean = false, // 手動スキャンかどうか（速度優先の判断に使用）
    locale: string = "ja"
  ): Promise<CompetitorExtractionResult> {
    // 本番環境やSerper API優先設定の場合、まずSerper APIを試行
    // 注意: この時点では自社の順位が不明なため、undefinedを渡す
    if (preferSerperApi && SerperApiClient.isAvailable()) {
      try {
        console.log(`[CompetitorExtractor] Using Serper API (preferred) for keyword "${keyword}"`);
        return await this.extractWithSerperApi(keyword, ownUrl, maxCompetitors, undefined);
      } catch (error: any) {
        console.warn(`[CompetitorExtractor] Serper API failed, falling back to browser tool: ${error.message}`);
        // Serper APIが失敗した場合、ブラウジングツールにフォールバック
      }
    }

    // ブラウジングツールで試行
    try {
      return await this.extractWithBrowser(keyword, ownUrl, maxCompetitors, retryCount, undefined, locale);
    } catch (error: any) {
      // CAPTCHAが検出された場合、Serper APIにフォールバック
      const isCaptchaError = error.message?.includes("CAPTCHA");
      if (isCaptchaError && SerperApiClient.isAvailable()) {
        console.log(
          `[CompetitorExtractor] CAPTCHA detected, falling back to Serper API for keyword "${keyword}"`
        );
        // ブラウジングツールで取得できた自社の順位を渡す（あれば）
        const ownPosition = error.ownPosition;
        return await this.extractWithSerperApi(keyword, ownUrl, maxCompetitors, ownPosition);
      }
      // その他のエラーは再スロー
      throw error;
    }
  }

  /**
   * ブラウジングツールで競合URLを抽出
   */
  private async extractWithBrowser(
    keyword: string,
    ownUrl: string,
    maxCompetitors: number,
    retryCount: number,
    ownPosition?: number, // GSC APIから取得した順位（オプション）
    locale: string = "ja"
  ): Promise<CompetitorExtractionResult> {
    await this.initialize();

    for (let attempt = 0; attempt < retryCount; attempt++) {
      let context: BrowserContext | null = null;
      try {
        context = await this.createContext();
        const page = await context.newPage();

        // Google検索を実行
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
          keyword
        )}&hl=ja`;
        
        // より自然な動作をシミュレート
        await page.goto(searchUrl, { 
          waitUntil: "domcontentloaded", // networkidleより軽量
          timeout: 30000 
        });
        
        // ページが完全に読み込まれるまで少し待機
        await page.waitForTimeout(1000 + Math.random() * 2000); // 1-3秒のランダム待機

        // CAPTCHAの検出
        const captchaDetected = await this.detectCaptcha(page);
        if (captchaDetected) {
          await page.close();
          await context.close();
          if (attempt < retryCount - 1) {
            // リトライ前に待機（10-20秒、CAPTCHA対策のため長めに）
            const delayMs = 10000 + Math.random() * 10000;
            console.log(`[CompetitorExtractor] CAPTCHA detected, waiting ${delayMs.toFixed(0)}ms before retry...`);
            await this.delay(delayMs);
            continue;
          }
          throw new Error(getErrorMessage(locale, "errors.captchaDetected"));
        }

        // 検索結果を取得
        const results = await this.parseSearchResults(page, ownUrl);

        console.log(
          `[CompetitorExtractor] Parsed ${results.length} search results for keyword "${keyword}"`
        );

        await page.close();
        await context.close();

        // 自社URLの順位を特定
        const normalizedOwnUrl = this.normalizeUrl(ownUrl);
        const ownResult = results.find((r) => this.normalizeUrl(r.url) === normalizedOwnUrl);
        // パラメータで渡されたownPositionがあればそれを使用、なければ検索結果から取得
        const finalOwnPosition = ownPosition || ownResult?.position;

        console.log(
          `[CompetitorExtractor] Own URL found at position: ${finalOwnPosition || "not found"} (searching for: ${normalizedOwnUrl})`
        );

        // 自社URLより上位の競合URLを抽出
        // 閾値: 20位を境界に、それ以上は1ページ目（上位10サイト）のみを分析
        let competitors: SearchResult[];
        if (finalOwnPosition) {
          if (finalOwnPosition <= 10) {
            // 自社が1-10位の場合、自社より上位のみを取得
            competitors = results
              .filter((result) => {
                const normalizedResultUrl = this.normalizeUrl(result.url);
                const normalizedOwnUrl = this.normalizeUrl(ownUrl);
                // 自社URLは除外
                if (normalizedResultUrl === normalizedOwnUrl) {
                  return false;
                }
                // 自社より上位のサイトのみ（finalOwnPositionを使用）
                return result.position < finalOwnPosition;
              })
              .slice(0, maxCompetitors);
          } else {
            // 自社が11位以上の場合、1ページ目（上位10サイト）のみを取得
            // 自社より上位が多すぎるため、検索結果1ページ目の競合を分析
            competitors = results
              .filter((result) => {
                const normalizedResultUrl = this.normalizeUrl(result.url);
                const normalizedOwnUrl = this.normalizeUrl(ownUrl);
                // 自社URLは除外
                if (normalizedResultUrl === normalizedOwnUrl) {
                  return false;
                }
                // 1ページ目（上位10サイト）のみ
                return result.position <= 10;
              })
              .slice(0, maxCompetitors);
          }
        } else {
          // 自社URLが見つからない場合、上位Nサイトを取得
          competitors = results
            .filter((result) => {
              const normalizedResultUrl = this.normalizeUrl(result.url);
              const normalizedOwnUrl = this.normalizeUrl(ownUrl);
              // 自社URLは除外
              return normalizedResultUrl !== normalizedOwnUrl;
            })
            .slice(0, maxCompetitors);
        }

        console.log(
          `[CompetitorExtractor] Returning ${competitors.length} competitors for keyword "${keyword}"`
        );

    return {
      competitors,
      ownPosition: finalOwnPosition || undefined,
      totalResults: results.length,
    };
      } catch (error: any) {
        // コンテキストが開いている場合は閉じる
        if (context) {
          try {
            await context.close();
          } catch (closeError) {
            // 無視
          }
        }
        console.error(
          `[CompetitorExtractor] Attempt ${attempt + 1}/${retryCount} failed for keyword "${keyword}":`,
          error.message || error
        );
        if (attempt < retryCount - 1) {
          // リトライ前に待機（10-20秒、CAPTCHA対策のため長めに）
          const delayMs = 10000 + Math.random() * 10000;
          console.log(`[CompetitorExtractor] Retrying after ${delayMs.toFixed(0)}ms...`);
          await this.delay(delayMs);
          continue;
        }
        throw error;
      }
    }

    // すべてのリトライが失敗した場合
    console.error(
      `[CompetitorExtractor] All ${retryCount} attempts failed for keyword "${keyword}"`
    );
    throw new Error(getErrorMessage(locale, "errors.captchaDetected"));
  }

  /**
   * Serper APIで競合URLを抽出
   * 自社の順位に応じて、取得する検索結果数を動的に調整
   */
  private async extractWithSerperApi(
    keyword: string,
    ownUrl: string,
    maxCompetitors: number,
    ownPosition?: number
  ): Promise<CompetitorExtractionResult> {
    if (!this.serperClient) {
      this.serperClient = new SerperApiClient();
    }

    console.log(`[CompetitorExtractor] Using Serper API for keyword "${keyword}"`);

    // 自社の順位に応じて、取得する検索結果数を動的に調整
    // 注意: Serper APIは1回のAPIリクエスト = 1 searchとしてカウントされるため、
    // 取得する検索結果数に関わらずコストは同じ
    let numResults = 20; // デフォルト
    if (ownPosition) {
      if (ownPosition <= 1) {
        numResults = 10; // 1位の場合、参考として10件
      } else if (ownPosition <= 5) {
        numResults = 10; // 2-5位の場合、10件で十分
      } else if (ownPosition <= 10) {
        numResults = 15; // 6-10位の場合、余裕を持って15件
      } else {
        numResults = 20; // 11位以上の場合、20件
      }
    }

    console.log(
      `[CompetitorExtractor] Fetching ${numResults} search results for keyword "${keyword}" (ownPosition: ${ownPosition || "unknown"})`
    );

    // Serper APIで検索結果を取得
    const results = await this.serperClient.search(keyword, "Japan", numResults);

    // 自社URLの順位を特定
    const normalizedOwnUrl = this.normalizeUrl(ownUrl);
    const ownResult = results.find((r) => this.normalizeUrl(r.url) === normalizedOwnUrl);
    // 既に取得した順位があればそれを使用、なければ検索結果から特定
    const finalOwnPosition = ownPosition || ownResult?.position;

    console.log(
      `[CompetitorExtractor] Own URL found at position: ${finalOwnPosition || "not found"} (searching for: ${normalizedOwnUrl})`
    );

    // 自社URLより上位の競合URLを抽出
    let competitors: SearchResult[];
    if (finalOwnPosition) {
      if (finalOwnPosition <= 10) {
        // 自社が1-10位の場合、自社より上位のみを取得
        competitors = results
          .filter((result) => {
            const normalizedResultUrl = this.normalizeUrl(result.url);
            const normalizedOwnUrl = this.normalizeUrl(ownUrl);
            // 自社URLは除外
            if (normalizedResultUrl === normalizedOwnUrl) {
              return false;
            }
            // 自社より上位のサイトのみ（finalOwnPositionを使用）
            return result.position < finalOwnPosition;
          })
          .slice(0, maxCompetitors);
      } else {
        // 自社が11位以上の場合、1ページ目（上位10サイト）のみを取得
        competitors = results
          .filter((result) => {
            const normalizedResultUrl = this.normalizeUrl(result.url);
            const normalizedOwnUrl = this.normalizeUrl(ownUrl);
            // 自社URLは除外
            if (normalizedResultUrl === normalizedOwnUrl) {
              return false;
            }
            // 1ページ目（上位10サイト）のみ
            return result.position <= 10;
          })
          .slice(0, maxCompetitors);
      }
    } else {
      // 自社URLが見つからない場合、上位Nサイトを取得
      competitors = results
        .filter((result) => {
          const normalizedResultUrl = this.normalizeUrl(result.url);
          const normalizedOwnUrl = this.normalizeUrl(ownUrl);
          // 自社URLは除外
          return normalizedResultUrl !== normalizedOwnUrl;
        })
        .slice(0, maxCompetitors);
    }

    console.log(
      `[CompetitorExtractor] Returning ${competitors.length} competitors from Serper API for keyword "${keyword}"`
    );

    return {
      competitors,
      ownPosition: finalOwnPosition || undefined,
      totalResults: results.length,
    };
  }

  /**
   * CAPTCHAを検出
   */
  private async detectCaptcha(page: Page): Promise<boolean> {
    try {
      // CAPTCHAの一般的なセレクタをチェック
      const captchaSelectors = [
        "#captcha-form",
        ".g-recaptcha",
        "#recaptcha",
        "iframe[src*='recaptcha']",
      ];

      for (const selector of captchaSelectors) {
        const element = await page.$(selector);
        if (element) {
          return true;
        }
      }

      // ページタイトルでCAPTCHAを検出
      const title = await page.title();
      if (title.toLowerCase().includes("captcha") || title.toLowerCase().includes("robot")) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 検索結果をパース
   */
  private async parseSearchResults(
    page: Page,
    ownUrl: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      // Google検索結果のセレクタ（2024年時点の構造）
      const resultSelectors = [
        "div.g", // 通常の検索結果
        "div[data-ved]", // データ属性を持つ検索結果
      ];

      console.log(`[CompetitorExtractor] Parsing search results with selectors: ${resultSelectors.join(", ")}`);

      for (const selector of resultSelectors) {
        const elements = await page.$$(selector);
        console.log(`[CompetitorExtractor] Found ${elements.length} elements with selector "${selector}"`);

        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];

          // URLを取得
          const linkElement = await element.$("a[href^='http']");
          if (!linkElement) continue;

          const url = await linkElement.getAttribute("href");
          if (!url || !url.startsWith("http")) continue;

          // タイトルを取得
          const titleElement =
            (await element.$("h3")) || (await element.$("h2")) || linkElement;
          const title = (await titleElement.textContent()) || "";

          // URLを正規化（クエリパラメータを除去）
          const normalizedUrl = this.normalizeUrl(url);
          const normalizedOwnUrl = this.normalizeUrl(ownUrl);

          // 重複チェック
          if (results.find((r) => this.normalizeUrl(r.url) === normalizedUrl)) {
            continue;
          }

          results.push({
            url: normalizedUrl,
            title: title.trim(),
            position: results.length + 1,
          });

          // 自社URLが見つかったら、それ以降は不要（上位のみ取得）
          if (normalizedUrl === normalizedOwnUrl) {
            console.log(`[CompetitorExtractor] Own URL found at position ${results.length}, stopping search`);
            break;
          }
        }

        if (results.length > 0) {
          console.log(`[CompetitorExtractor] Successfully parsed ${results.length} results with selector "${selector}"`);
          break;
        }
      }

      if (results.length === 0) {
        console.warn(`[CompetitorExtractor] No search results found. Page title: ${await page.title()}`);
      }
    } catch (error) {
      console.error("[CompetitorExtractor] Error parsing search results:", error);
    }

    return results;
  }

  /**
   * URLを正規化（クエリパラメータ、フラグメントを除去）
   */
  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

