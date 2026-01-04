/**
 * 多通貨対応の管理
 */

export type Currency = 'USD' | 'JPY' | 'EUR' | 'GBP';

/**
 * Stripe Price IDの構造（環境ごとに別カラムで管理）
 */
export interface StripePriceIds {
  usd?: string;
  jpy?: string;
  eur?: string;
  gbp?: string;
}

/**
 * 通貨コードからロケールを判定
 */
export function getCurrencyFromLocale(locale: string): Currency {
  // ロケールから通貨を推測
  if (locale.startsWith('ja')) {
    return 'JPY';
  }
  if (locale.startsWith('en')) {
    // デフォルトはUSD、将来的に国コードで判定可能
    return 'USD';
  }
  if (locale.startsWith('de') || locale.startsWith('fr') || locale.startsWith('es') || locale.startsWith('it')) {
    return 'EUR';
  }
  if (locale.startsWith('en-GB')) {
    return 'GBP';
  }
  
  // デフォルトはUSD
  return 'USD';
}

/**
 * 価格をフォーマット（通貨記号付き）
 */
export function formatPrice(amount: number, currency: Currency): string {
  const currencyMap: Record<Currency, { symbol: string; locale: string }> = {
    USD: { symbol: '$', locale: 'en-US' },
    JPY: { symbol: '¥', locale: 'ja-JP' },
    EUR: { symbol: '€', locale: 'de-DE' },
    GBP: { symbol: '£', locale: 'en-GB' },
  };

  const config = currencyMap[currency];
  
  // JPYの場合は整数、それ以外は小数点以下2桁
  const formatted = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(currency === 'JPY' ? amount : amount / 100);

  return formatted;
}

/**
 * Stripe Price IDを取得
 */
export function getStripePriceId(
  priceIds: StripePriceIds | null,
  currency: Currency
): string | null {
  if (!priceIds) {
    console.error(`[getStripePriceId] priceIds is null for currency: ${currency}`);
    return null;
  }

  const key = currency.toLowerCase() as keyof StripePriceIds;
  const priceId = priceIds[key] || null;
  
  if (!priceId) {
    console.error(`[getStripePriceId] Price ID not found for currency: ${currency} (key: ${key})`);
    console.error(`[getStripePriceId] Available keys:`, Object.keys(priceIds));
    console.error(`[getStripePriceId] Full priceIds object:`, JSON.stringify(priceIds, null, 2));
  }
  
  return priceId;
}

/**
 * 通貨コードの検証
 */
export function isValidCurrency(currency: string): currency is Currency {
  return ['USD', 'JPY', 'EUR', 'GBP'].includes(currency.toUpperCase());
}


/**
 * Accept-Languageヘッダーからロケールを抽出
 */
export function getLocaleFromAcceptLanguage(acceptLanguage: string | null): string {
  if (!acceptLanguage) {
    return 'ja'; // デフォルト
  }

  // Accept-Languageヘッダーの例: "en-US,en;q=0.9,ja;q=0.8"
  // 最初の言語コードを取得
  const firstLang = acceptLanguage.split(',')[0].split(';')[0].trim();
  
  // 言語コードのみ抽出（例: "en-US" → "en"）
  const langCode = firstLang.split('-')[0].toLowerCase();
  
  // サポートしている言語のみ返す
  if (langCode === 'ja') return 'ja';
  if (langCode === 'en') return 'en';
  
  return 'ja'; // デフォルト
}


/**
 * ロケールから通貨を自動判定
 * 
 * 優先順位:
 * 1. 明示的に指定された通貨（explicitCurrency）- ユーザーが手動で選択した場合
 * 2. ユーザーのロケール設定（userLocale）- DBに保存されているロケール
 * 3. ブラウザのAccept-Languageヘッダー（acceptLanguage）- 初回訪問時など
 * 4. デフォルト（USD）
 * 
 * 注意: 通貨は常にロケールから導出されます。ロケールが決まれば通貨も自動的に決まります。
 */
export function detectCurrencyFromLocale(options: {
  explicitCurrency?: string | null;
  userLocale?: string | null;
  acceptLanguage?: string | null;
}): Currency {
  // 1. 明示的に指定された通貨（最優先）- ユーザーが手動で選択した場合
  if (options.explicitCurrency && isValidCurrency(options.explicitCurrency)) {
    return options.explicitCurrency;
  }

  // 2. ユーザーのロケール設定（DBに保存されている）
  if (options.userLocale) {
    return getCurrencyFromLocale(options.userLocale);
  }

  // 3. ブラウザのAccept-Languageヘッダー（初回訪問時など）
  if (options.acceptLanguage) {
    const locale = getLocaleFromAcceptLanguage(options.acceptLanguage);
    return getCurrencyFromLocale(locale);
  }

  // 4. デフォルト
  return 'USD';
}

/**
 * @deprecated この関数は非推奨です。detectCurrencyFromLocaleを使用してください。
 * GeoIPを使用しないシンプルなバージョンに置き換えられました。
 */
export async function detectCurrency(options: {
  explicitCurrency?: string | null;
  userPreferredCurrency?: string | null;
  ipAddress?: string | null;
  acceptLanguage?: string | null;
  userLocale?: string | null;
}): Promise<Currency> {
  return detectCurrencyFromLocale({
    explicitCurrency: options.explicitCurrency,
    userLocale: options.userLocale,
    acceptLanguage: options.acceptLanguage,
  });
}

