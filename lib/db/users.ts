import { createSupabaseClient } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { isAccountLocked, getLockRemainingMinutes, recordLoginAttempt } from '@/lib/db/login-attempts';
import { getErrorMessage } from '@/lib/api-helpers';

export interface User {
  id: string;
  email: string;
  name: string | null;
  provider: string | null;
  provider_id: string | null;
  plan_id: string | null;
  pending_plan_id: string | null; // 次回適用されるプラン（ダウングレード時など）
  plan_started_at: string | null;
  plan_ends_at: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  timezone: string | null;
  locale: string | null;
  password_hash: string | null;
  email_verified: boolean | null;
  email_verification_token: string | null;
  email_verification_token_expires_at: string | null;
  password_reset_token: string | null;
  password_reset_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * ユーザー情報を取得または作成
 */
export async function getOrCreateUser(
  email: string,
  name: string | null,
  provider: string,
  providerId: string,
  timezone?: string | null
): Promise<User> {
  const supabase = createSupabaseClient();

  // 既存ユーザーを検索
  const { data: existingUser, error: searchError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .is('deleted_at', null)
    .single();

  if (searchError && searchError.code !== 'PGRST116') {
    // PGRST116は「行が見つからない」エラーなので無視
    throw new Error(`Failed to search user: ${searchError.message}`);
  }

    // 既存ユーザーがいる場合は更新
    if (existingUser) {
      const updateData: any = {
        name: name || existingUser.name,
        provider,
        provider_id: providerId,
        updated_at: new Date().toISOString(),
        email_verified: existingUser.email_verified || (provider === 'google' ? true : false),
      };

      // タイムゾーンが提供されていて、既存ユーザーにタイムゾーンが設定されていない場合のみ更新
      if (timezone && !existingUser.timezone) {
        updateData.timezone = timezone;
      }

      // ロケールが設定されていない場合はデフォルト値（'ja'）を設定
      if (!existingUser.locale) {
        updateData.locale = 'ja';
      }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', existingUser.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update user: ${updateError.message}`);
    }

    return updatedUser as User;
  }

  // 新規ユーザーを作成（無料プランを割り当て）
  const { data: freePlan } = await supabase
    .from('plans')
    .select('id')
    .eq('name', 'free')
    .single();

  if (!freePlan) {
    throw new Error('Free plan not found');
  }

  // フリープランの場合はトライアル期間を設定しない（分析回数などの制限のみで制御）
  // トライアル期間は有料プラン（スターターなど）のみに適用

  // Google OAuthの場合はemail_verifiedをtrueに設定（Googleが既に認証済み）
  // パスワード認証の場合はemail_verifiedはfalse（メール認証が必要）
  const emailVerified = provider === 'google' ? true : false;

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      email,
      name,
      provider,
      provider_id: providerId,
      plan_id: freePlan.id,
      trial_ends_at: null, // フリープランにはトライアル期間を設定しない
      timezone: timezone || 'UTC', // タイムゾーンが提供されていない場合はUTC
      locale: 'ja', // デフォルトロケールは'ja'
      email_verified: emailVerified, // Google OAuthの場合はtrue、それ以外はfalse
      // password_hashは設定しない（NULLのまま）- Google OAuthの場合は不要
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  return newUser as User;
}

/**
 * ユーザーIDからユーザー情報を取得
 */
export async function getUserById(userId: string): Promise<User | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data as User;
}

/**
 * メールアドレスからユーザー情報を取得
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get user by email: ${error.message}`);
  }

  return data as User;
}

/**
 * ユーザーのタイムゾーンを更新
 */
export async function updateUserTimezone(userId: string, timezone: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('users')
    .update({
      timezone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update user timezone: ${error.message}`);
  }
}

/**
 * ユーザーのロケールを更新
 */
export async function updateUserLocale(userId: string, locale: string): Promise<void> {
  const supabase = createSupabaseClient();

  // ロケールの検証（'ja' または 'en' のみ許可）
  if (locale !== 'ja' && locale !== 'en') {
    throw new Error(`Invalid locale: ${locale}. Only 'ja' and 'en' are supported.`);
  }

  const { error } = await supabase
    .from('users')
    .update({
      locale,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update user locale: ${error.message}`);
  }
}


/**
 * パスワードをハッシュ化
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * パスワードを検証
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * メール/パスワードでユーザーを作成
 */
export async function createUserWithPassword(
  email: string,
  password: string,
  name?: string | null,
  locale: string = "ja"
): Promise<User> {
  const supabase = createSupabaseClient();

  // 既存ユーザーをチェック
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new Error(getErrorMessage(locale, "errors.emailAlreadyRegistered"));
  }

  // パスワードをハッシュ化
  const passwordHash = await hashPassword(password);

  // メール認証トークンを生成
  const verificationToken = randomBytes(32).toString('hex');
  const verificationTokenExpiresAt = new Date();
  verificationTokenExpiresAt.setHours(verificationTokenExpiresAt.getHours() + 24); // 24時間有効

  // 無料プランを取得
  const { data: freePlan } = await supabase
    .from('plans')
    .select('id')
    .eq('name', 'free')
    .single();

  if (!freePlan) {
    throw new Error('Free plan not found');
  }

  // フリープランの場合はトライアル期間を設定しない（分析回数などの制限のみで制御）
  // トライアル期間は有料プラン（スターターなど）のみに適用

  // ユーザーを作成
  const { data: newUser, error: createError } = await supabase
    .from('users')
          .insert({
            email,
            name: name || null,
            password_hash: passwordHash,
            email_verified: false,
            email_verification_token: verificationToken,
            email_verification_token_expires_at: verificationTokenExpiresAt.toISOString(),
            provider: 'credentials',
            plan_id: freePlan.id,
            trial_ends_at: null, // フリープランにはトライアル期間を設定しない
            timezone: 'UTC',
            locale: 'ja', // デフォルトロケールは'ja'
          })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  return newUser as User;
}

/**
 * メール/パスワードでユーザーを認証
 */
export async function authenticateUserWithPassword(
  email: string,
  password: string,
  locale: string = "ja"
): Promise<User | null> {
  // ログイン試行回数制限をチェック
  const locked = await isAccountLocked(email);
  if (locked) {
    const remainingMinutes = await getLockRemainingMinutes(email);
    throw new Error(
      remainingMinutes 
        ? getErrorMessage(locale, "errors.accountLocked", { minutes: remainingMinutes })
        : getErrorMessage(locale, "errors.accountLockedGeneric")
    );
  }

  const user = await getUserByEmail(email);
  
  if (!user || !user.password_hash) {
    // ログイン失敗を記録（ユーザーが存在しない場合も記録）
    await recordLoginAttempt(email, null, null, false, 'invalid_credentials');
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  
  if (!isValid) {
    await recordLoginAttempt(email, null, null, false, 'invalid_password');
    return null;
  }

  // ログイン成功を記録
  await recordLoginAttempt(email, null, null, true);
  
  return user;
}

/**
 * メール認証トークンを検証
 */
export async function verifyEmailToken(token: string): Promise<User | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email_verification_token', token)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  const user = data as User;

  // トークンの有効期限をチェック
  if (user.email_verification_token_expires_at) {
    const expiresAt = new Date(user.email_verification_token_expires_at);
    if (expiresAt < new Date()) {
      return null; // トークンが期限切れ
    }
  }

  // メール認証を完了
  const { error: updateError } = await supabase
    .from('users')
    .update({
      email_verified: true,
      email_verification_token: null,
      email_verification_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) {
    throw new Error(`Failed to verify email: ${updateError.message}`);
  }

  return { ...user, email_verified: true } as User;
}

/**
 * Stripe Customer IDを更新
 */
export async function updateStripeCustomerId(
  userId: string,
  customerId: string
): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('users')
    .update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update Stripe customer ID: ${error.message}`);
  }
}

/**
 * Stripe Subscription IDを更新
 */
export async function updateStripeSubscriptionId(
  userId: string,
  subscriptionId: string | null
): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('users')
    .update({
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update Stripe subscription ID: ${error.message}`);
  }
}

/**
 * ユーザーのプランを更新
 */
export async function updateUserPlan(
  userId: string,
  planId: string,
  planStartedAt?: Date,
  planEndsAt?: Date | null,
  trialEndsAt?: Date | null,
  pendingPlanId?: string | null
): Promise<void> {
  const supabase = createSupabaseClient();

  const updateData: any = {
    plan_id: planId,
    updated_at: new Date().toISOString(),
  };

  // planStartedAtが指定されている場合は必ず設定（undefinedの場合は設定しない）
  if (planStartedAt !== undefined) {
    updateData.plan_started_at = planStartedAt ? planStartedAt.toISOString() : null;
  }

  // planEndsAtが指定されている場合は必ず設定（undefinedの場合は設定しない）
  if (planEndsAt !== undefined) {
    updateData.plan_ends_at = planEndsAt ? planEndsAt.toISOString() : null;
  }

  // trialEndsAtが指定されている場合は必ず設定（undefinedの場合は設定しない）
  if (trialEndsAt !== undefined) {
    updateData.trial_ends_at = trialEndsAt ? trialEndsAt.toISOString() : null;
  }

  // pendingPlanIdが指定されている場合は必ず設定（undefinedの場合は設定しない）
  if (pendingPlanId !== undefined) {
    updateData.pending_plan_id = pendingPlanId || null;
  }

  console.log(`[updateUserPlan] Updating user plan - userId: ${userId}, updateData:`, JSON.stringify(updateData, null, 2));

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId)
    .select();

  if (error) {
    console.error(`[updateUserPlan] Error updating user plan:`, error);
    throw new Error(`Failed to update user plan: ${error.message}`);
  }

  console.log(`[updateUserPlan] User plan updated successfully - userId: ${userId}, updated:`, data);
}

/**
 * ユーザーのpending_plan_idを更新
 */
export async function updatePendingPlanId(
  userId: string,
  pendingPlanId: string | null
): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('users')
    .update({
      pending_plan_id: pendingPlanId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error(`[updatePendingPlanId] Error updating pending plan:`, error);
    throw new Error(`Failed to update pending plan: ${error.message}`);
  }

  console.log(`[updatePendingPlanId] Pending plan updated - userId: ${userId}, pendingPlanId: ${pendingPlanId}`);
}
