import { createSupabaseClient } from '@/lib/supabase';

export type RateLimitAction = 'login' | 'register' | 'password_reset' | 'email_verification' | 'try_analysis';

interface RateLimitConfig {
  maxAttempts: number;
  windowMinutes: number;
}

const RATE_LIMIT_CONFIGS: Record<RateLimitAction, RateLimitConfig> = {
  login: {
    maxAttempts: 10, // 1時間に10回まで
    windowMinutes: 60,
  },
  register: {
    maxAttempts: 5, // 1時間に5回まで
    windowMinutes: 60,
  },
  password_reset: {
    maxAttempts: 5, // 1時間に5回まで
    windowMinutes: 60,
  },
  email_verification: {
    maxAttempts: 10, // 1時間に10回まで
    windowMinutes: 60,
  },
  try_analysis: {
    maxAttempts: 5, // 1時間に5回まで（未ログイン体験）
    windowMinutes: 60,
  },
};

/**
 * レート制限をチェック
 * @param identifier 識別子（メールアドレスまたはIPアドレス）
 * @param actionType アクションタイプ
 * @returns レート制限内の場合はtrue、超過している場合はfalse
 */
export async function checkRateLimit(
  identifier: string,
  actionType: RateLimitAction
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const supabase = createSupabaseClient();
  const config = RATE_LIMIT_CONFIGS[actionType];

  // 現在の時間ウィンドウの開始時刻を計算
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setMinutes(windowStart.getMinutes() - (windowStart.getMinutes() % config.windowMinutes));
  windowStart.setSeconds(0);
  windowStart.setMilliseconds(0);

  // 古いレコードを削除（1時間以上前のレコード）
  const cleanupTime = new Date(now);
  cleanupTime.setHours(cleanupTime.getHours() - 2);
  await supabase
    .from('rate_limits')
    .delete()
    .lt('window_start', cleanupTime.toISOString());

  // 現在のウィンドウでの試行回数を取得または作成
  const { data: existingLimit, error: selectError } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .eq('window_start', windowStart.toISOString())
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    // エラーが発生した場合は、安全側に倒して許可しない
    console.error('[RateLimit] Error checking rate limit:', selectError);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(windowStart.getTime() + config.windowMinutes * 60 * 1000),
    };
  }

  if (!existingLimit) {
    // 新しいレコードを作成
    await supabase
      .from('rate_limits')
      .insert({
        identifier,
        action_type: actionType,
        count: 1,
        window_start: windowStart.toISOString(),
      });

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetAt: new Date(windowStart.getTime() + config.windowMinutes * 60 * 1000),
    };
  }

  // 既存のレコードを更新
  const newCount = existingLimit.count + 1;
  await supabase
    .from('rate_limits')
    .update({
      count: newCount,
      updated_at: now.toISOString(),
    })
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .eq('window_start', windowStart.toISOString());

  const remaining = Math.max(0, config.maxAttempts - newCount);
  const resetAt = new Date(windowStart.getTime() + config.windowMinutes * 60 * 1000);

  return {
    allowed: newCount <= config.maxAttempts,
    remaining,
    resetAt,
  };
}

/**
 * IPアドレスを取得（Next.jsのRequestから）
 */
export function getClientIpAddress(request: Request | { headers: Headers | { get: (key: string) => string | null } }): string | null {
  const headers = request.headers instanceof Headers ? request.headers : request.headers;

  // X-Forwarded-Forヘッダーから取得（プロキシ経由の場合）
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // カンマ区切りの場合は最初のIPアドレスを使用
    return forwardedFor.split(',')[0].trim();
  }

  // X-Real-IPヘッダーから取得
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // その他のヘッダーをチェック
  const cfConnectingIp = headers.get('cf-connecting-ip'); // Cloudflare
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return null;
}

/**
 * User-Agentを取得
 */
export function getUserAgent(request: Request | { headers: Headers | { get: (key: string) => string | null } }): string | null {
  const headers = request.headers instanceof Headers ? request.headers : request.headers;
  return headers.get('user-agent');
}

