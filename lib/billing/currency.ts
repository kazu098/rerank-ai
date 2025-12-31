/**
 * 多通貨対応と固定為替レートの管理
 */

export type Currency = 'USD' | 'JPY' | 'EUR' | 'GBP';

export interface ExchangeRates {
  jpy: number; // 1 USD = 150 JPY
  eur: number; // 1 USD = 0.85 EUR
  gbp: number; // 1 USD = 0.80 GBP
}

export interface StripePriceIds {
  usd?: string;
  jpy?: string;
  eur?: string;
  gbp?: string;
}

/**
 * デフォルトの固定為替レート
 */
export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  jpy: 150.00,
  eur: 0.85,
  gbp: 0.80,
};

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
 * USD基準の価格を指定通貨に変換（固定為替レート）
 * @param priceUSD USD基準の価格（セント単位）
 * @param currency 変換先の通貨
 * @param exchangeRates 固定為替レート（オプション）
 * @returns 変換後の価格（最小単位、例：JPYは円、EURはセント）
 */
export function convertPrice(
  priceUSD: number,
  currency: Currency,
  exchangeRates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number {
  if (currency === 'USD') {
    return priceUSD;
  }

  const rate = exchangeRates[currency.toLowerCase() as keyof ExchangeRates];
  if (!rate) {
    throw new Error(`Exchange rate not found for currency: ${currency}`);
  }

  // 四捨五入して整数に変換
  return Math.round(priceUSD * rate);
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
    return null;
  }

  const key = currency.toLowerCase() as keyof StripePriceIds;
  return priceIds[key] || null;
}

/**
 * 通貨コードの検証
 */
export function isValidCurrency(currency: string): currency is Currency {
  return ['USD', 'JPY', 'EUR', 'GBP'].includes(currency.toUpperCase());
}

