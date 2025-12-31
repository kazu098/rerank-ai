import Stripe from 'stripe';

/**
 * Stripeクライアントのシングルトンインスタンス
 */
let stripeClient: Stripe | null = null;

/**
 * Stripeクライアントを取得
 * 環境変数からAPIキーを読み込み、シングルトンインスタンスを返す
 */
export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
    typescript: true,
  });

  return stripeClient;
}

/**
 * Stripe Publishable Keyを取得
 */
export function getStripePublishableKey(): string {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set in environment variables');
  }
  return publishableKey;
}

