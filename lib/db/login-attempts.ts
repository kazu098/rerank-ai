import { createSupabaseClient } from '@/lib/supabase';

export interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

const MAX_FAILED_ATTEMPTS = 10; // 10回以下の失敗でロック
const LOCK_DURATION_MINUTES = 30; // 30分間ロック

/**
 * ログイン試行を記録
 */
export async function recordLoginAttempt(
  email: string,
  ipAddress: string | null,
  userAgent: string | null,
  success: boolean,
  failureReason?: string
): Promise<void> {
  const supabase = createSupabaseClient();

  // login_attemptsテーブルに記録
  await supabase
    .from('login_attempts')
    .insert({
      email,
      ip_address: ipAddress,
      user_agent: userAgent,
      success,
      failure_reason: failureReason || null,
    });

  if (!success) {
    // 失敗した場合、usersテーブルの失敗回数を更新
    const { data: user } = await supabase
      .from('users')
      .select('failed_login_attempts, locked_until')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    if (user) {
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = newFailedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
        : null;

      await supabase
        .from('users')
        .update({
          failed_login_attempts: newFailedAttempts,
          last_failed_login_at: new Date().toISOString(),
          locked_until: lockUntil?.toISOString() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('email', email);
    }
  } else {
    // 成功した場合、失敗回数をリセット
    await supabase
      .from('users')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_failed_login_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('email', email);
  }
}

/**
 * アカウントがロックされているかチェック
 */
export async function isAccountLocked(email: string): Promise<boolean> {
  const supabase = createSupabaseClient();

  const { data: user } = await supabase
    .from('users')
    .select('locked_until')
    .eq('email', email)
    .is('deleted_at', null)
    .single();

  if (!user || !user.locked_until) {
    return false;
  }

  const lockedUntil = new Date(user.locked_until);
  const now = new Date();

  // ロック期間が過ぎている場合はロックを解除
  if (lockedUntil < now) {
    await unlockAccount(email);
    return false;
  }

  return true;
}

/**
 * アカウントのロックを解除
 */
export async function unlockAccount(email: string): Promise<void> {
  const supabase = createSupabaseClient();

  await supabase
    .from('users')
    .update({
      locked_until: null,
      failed_login_attempts: 0,
      last_failed_login_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('email', email);
}

/**
 * ロック解除までの残り時間を取得（分単位）
 */
export async function getLockRemainingMinutes(email: string): Promise<number | null> {
  const supabase = createSupabaseClient();

  const { data: user } = await supabase
    .from('users')
    .select('locked_until')
    .eq('email', email)
    .is('deleted_at', null)
    .single();

  if (!user || !user.locked_until) {
    return null;
  }

  const lockedUntil = new Date(user.locked_until);
  const now = new Date();

  if (lockedUntil < now) {
    await unlockAccount(email);
    return null;
  }

  return Math.ceil((lockedUntil.getTime() - now.getTime()) / (60 * 1000));
}

