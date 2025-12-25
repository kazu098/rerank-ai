import * as cheerio from "cheerio";
import { chromium, Browser, Page } from "playwright";

export interface ArticleContent {
  url: string;
  title: string;
  headings: Array<{
    level: number;
    text: string;
  }>;
  paragraphs: string[];
  lists: string[][];
  fullText: string;
  wordCount: number;
}

/**
 * 記事スクレイピングクラス
 * 競合記事と自社記事の内容を取得
 */
export class ArticleScraper {
  private browser: Browser | null = null;
  private readonly timeout = 30000; // 30秒
  private readonly retryCount = 3;
  private readonly retryDelay = 2000; // 2秒

  /**
   * ブラウザを初期化（JavaScriptレンダリングが必要な場合のみ）
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
      ],
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
   * 記事の内容を取得
   * @param url 記事URL
   * @param usePlaywright JavaScriptレンダリングが必要な場合true
   */
  async scrapeArticle(
    url: string,
    usePlaywright: boolean = false
  ): Promise<ArticleContent> {
    let html: string;

    if (usePlaywright) {
      html = await this.fetchWithPlaywright(url);
    } else {
      html = await this.fetchWithFetch(url);
    }

    return this.parseHtml(url, html);
  }

  /**
   * fetchでHTMLを取得
   */
  private async fetchWithFetch(url: string): Promise<string> {
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          },
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        return html;
      } catch (error: any) {
        if (attempt === this.retryCount - 1) {
          throw new Error(`Failed to fetch ${url} after ${this.retryCount} attempts: ${error.message}`);
        }
        await this.delay(this.retryDelay * (attempt + 1));
      }
    }

    throw new Error(`Failed to fetch ${url}`);
  }

  /**
   * PlaywrightでHTMLを取得（JavaScriptレンダリングが必要な場合）
   */
  private async fetchWithPlaywright(url: string): Promise<string> {
    await this.initialize();

    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
    });

    const page = await context.newPage();

    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: this.timeout,
      });

      // 少し待機してJavaScriptの実行を待つ
      await page.waitForTimeout(2000);

      const html = await page.content();
      await context.close();
      return html;
    } catch (error: any) {
      await context.close();
      throw new Error(`Failed to fetch with Playwright: ${error.message}`);
    }
  }

  /**
   * HTMLをパースして記事内容を抽出
   */
  private parseHtml(url: string, html: string): ArticleContent {
    const $ = cheerio.load(html);

    // タイトルを取得
    const title =
      $("title").first().text() ||
      $("h1").first().text() ||
      $('meta[property="og:title"]').attr("content") ||
      "";

    // 不要な要素を除去
    $("script, style, nav, header, footer, aside, .ad, .ads, .advertisement, .sidebar, .menu, .navigation").remove();

    // メインコンテンツエリアを特定
    const mainContent =
      $("article").first().length > 0
        ? $("article").first()
        : $("main").first().length > 0
        ? $("main").first()
        : $("body");

    // 見出しを抽出
    const headings: Array<{ level: number; text: string }> = [];
    mainContent.find("h1, h2, h3, h4, h5, h6").each((_, element) => {
      const $el = $(element);
      const level = parseInt($el.prop("tagName").substring(1));
      const text = $el.text().trim();
      if (text) {
        headings.push({ level, text });
      }
    });

    // 段落を抽出
    const paragraphs: string[] = [];
    mainContent.find("p").each((_, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 20) {
        // 短すぎるテキストは除外
        paragraphs.push(text);
      }
    });

    // リストを抽出
    const lists: string[][] = [];
    mainContent.find("ul, ol").each((_, element) => {
      const items: string[] = [];
      $(element)
        .find("li")
        .each((_, li) => {
          const text = $(li).text().trim();
          if (text) {
            items.push(text);
          }
        });
      if (items.length > 0) {
        lists.push(items);
      }
    });

    // 全文を取得
    const fullText = mainContent.text().trim();
    const wordCount = fullText.split(/\s+/).length;

    return {
      url,
      title: title.trim(),
      headings,
      paragraphs,
      lists,
      fullText,
      wordCount,
    };
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

