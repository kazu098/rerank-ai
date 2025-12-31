/**
 * 多通貨対応の管理
 */

export type Currency = 'USD' | 'JPY' | 'EUR' | 'GBP';

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

