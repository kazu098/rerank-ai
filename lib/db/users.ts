import { createSupabaseClient } from '@/lib/supabase';

export interface User {
  id: string;
  email: string;
  name: string | null;
  provider: string | null;
  provider_id: string | null;
  plan_id: string | null;
  plan_started_at: string | null;
  plan_ends_at: string | null;
  trial_ends_at: string | null;
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
  providerId: string
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
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        name: name || existingUser.name,
        provider,
        provider_id: providerId,
        updated_at: new Date().toISOString(),
      })
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

  // トライアル期間を設定（7日間）
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      email,
      name,
      provider,
      provider_id: providerId,
      plan_id: freePlan.id,
      trial_ends_at: trialEndsAt.toISOString(),
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
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data as User;
}

