import Stripe from 'stripe';

/**
 * Stripeクライアントのシングルトンインスタンス
 */
let stripeClient: Stripe | null = null;

/**
 * Stripeモードを取得（test または live）
 * 環境変数 STRIPE_MODE が設定されている場合はそれを使用
 * 未設定の場合は、STRIPE_SECRET_KEY のプレフィックスから判定
 */
function getStripeMode(): 'test' | 'live' {
  // 明示的にモードが指定されている場合
  const mode = process.env.STRIPE_MODE;
  if (mode === 'test' || mode === 'live') {
    return mode;
  }

  // STRIPE_SECRET_KEYから判定（後方互換性のため）
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    if (secretKey.startsWith('sk_test_')) {
      return 'test';
    }
    if (secretKey.startsWith('sk_live_')) {
      return 'live';
    }
  }

  // デフォルトはtestモード（安全側に倒す）
  return 'test';
}

/**
 * Stripe Secret Keyを取得
 * STRIPE_MODEに応じて適切なキーを選択
 */
function getStripeSecretKey(): string {
  const mode = getStripeMode();

  if (mode === 'live') {
    // 本番モード: STRIPE_LIVE_SECRET_KEY または STRIPE_SECRET_KEY を使用
    const liveKey = process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!liveKey) {
      throw new Error('STRIPE_LIVE_SECRET_KEY or STRIPE_SECRET_KEY is not set for live mode');
    }
    if (!liveKey.startsWith('sk_live_')) {
      throw new Error('STRIPE_LIVE_SECRET_KEY must start with sk_live_');
    }
    return liveKey;
  } else {
    // テストモード: STRIPE_TEST_SECRET_KEY または STRIPE_SECRET_KEY を使用
    const testKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!testKey) {
      throw new Error('STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY is not set for test mode');
    }
    if (!testKey.startsWith('sk_test_')) {
      throw new Error('STRIPE_TEST_SECRET_KEY must start with sk_test_');
    }
    return testKey;
  }
}

/**
 * Stripe Publishable Keyを取得（内部関数）
 * STRIPE_MODEに応じて適切なキーを選択
 */
function getStripePublishableKeyInternal(): string {
  const mode = getStripeMode();

  if (mode === 'live') {
    // 本番モード: NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY または NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY を使用
    const liveKey = process.env.NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!liveKey) {
      throw new Error('NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set for live mode');
    }
    if (!liveKey.startsWith('pk_live_')) {
      throw new Error('NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY must start with pk_live_');
    }
    return liveKey;
  } else {
    // テストモード: NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY または NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY を使用
    const testKey = process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!testKey) {
      throw new Error('NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set for test mode');
    }
    if (!testKey.startsWith('pk_test_')) {
      throw new Error('NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY must start with pk_test_');
    }
    return testKey;
  }
}

/**
 * Stripe Webhook Secretを取得
 * STRIPE_MODEに応じて適切なシークレットを選択
 */
export function getStripeWebhookSecret(): string {
  const mode = getStripeMode();

  if (mode === 'live') {
    // 本番モード: STRIPE_LIVE_WEBHOOK_SECRET または STRIPE_WEBHOOK_SECRET を使用
    const liveSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    if (!liveSecret) {
      throw new Error('STRIPE_LIVE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET is not set for live mode');
    }
    return liveSecret;
  } else {
    // テストモード: STRIPE_TEST_WEBHOOK_SECRET または STRIPE_WEBHOOK_SECRET を使用
    const testSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    if (!testSecret) {
      throw new Error('STRIPE_TEST_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET is not set for test mode');
    }
    return testSecret;
  }
}

/**
 * Stripeクライアントを取得
 * 環境変数からAPIキーを読み込み、シングルトンインスタンスを返す
 */
export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = getStripeSecretKey();

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
  return getStripePublishableKeyInternal();
}

/**
 * Stripe Publishable Keyを取得（クライアント側で使用）
 * @deprecated getStripePublishableKey を使用してください
 */
export function getStripePublishableKeyForClient(): string {
  return getStripePublishableKey();
}
