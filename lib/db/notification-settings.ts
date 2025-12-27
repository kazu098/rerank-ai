import { createSupabaseClient } from '@/lib/supabase';

export interface NotificationSettings {
  id: string;
  user_id: string;
  article_id: string | null;
  notification_type: string;
  channel: string;
  recipient: string;
  is_enabled: boolean;
  drop_threshold: number;
  keyword_drop_threshold: number;
  comparison_days: number;
  consecutive_drop_days: number;
  min_impressions: number;
  notification_cooldown_days: number;
  notification_time: string | null; // TIME型（例: '09:00:00'）
  timezone: string | null; // タイムゾーン（例: 'Asia/Tokyo'）
  created_at: string;
  updated_at: string;
}

/**
 * デフォルトの通知設定
 */
export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettings, 'id' | 'user_id' | 'article_id' | 'notification_type' | 'channel' | 'recipient' | 'created_at' | 'updated_at'> = {
  is_enabled: true,
  drop_threshold: 2.0,
  keyword_drop_threshold: 10.0,
  comparison_days: 7,
  consecutive_drop_days: 3,
  min_impressions: 100,
  notification_cooldown_days: 7,
};

/**
 * ユーザーの通知設定を取得（記事IDが指定されている場合は記事固有の設定、nullの場合はデフォルト設定）
 */
export async function getNotificationSettings(
  userId: string,
  articleId?: string | null
): Promise<NotificationSettings | null> {
  const supabase = createSupabaseClient();

  // 記事固有の設定を取得
  if (articleId) {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('article_id', articleId)
      .eq('is_enabled', true)
      .single();

    if (!error && data) {
      const settings = data as NotificationSettings;
      // タイムゾーンが設定されていない場合は、ユーザーのタイムゾーンを使用
      if (!settings.timezone && userTimezone) {
        settings.timezone = userTimezone;
      }
      return settings;
    }
  }

  // 記事固有の設定がない場合、ユーザー全体のデフォルト設定を取得（article_idがnull）
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .is('article_id', null)
    .eq('is_enabled', true)
    .single();

  if (!error && data) {
    const settings = data as NotificationSettings;
    // タイムゾーンが設定されていない場合は、ユーザーのタイムゾーンを使用
    if (!settings.timezone && userTimezone) {
      settings.timezone = userTimezone;
    }
    return settings;
  }

  // 設定が存在しない場合はnullを返す（呼び出し側でデフォルト値を使用）
  return null;
}

/**
 * 通知設定を作成または更新
 */
export async function saveOrUpdateNotificationSettings(
  userId: string,
  settings: Partial<NotificationSettings> & {
    notification_type: string;
    channel: string;
    recipient: string;
  },
  articleId?: string | null
): Promise<NotificationSettings> {
  const supabase = createSupabaseClient();

  const settingsData = {
    user_id: userId,
    article_id: articleId || null,
    notification_type: settings.notification_type,
    channel: settings.channel,
    recipient: settings.recipient,
    is_enabled: settings.is_enabled ?? true,
    drop_threshold: settings.drop_threshold ?? DEFAULT_NOTIFICATION_SETTINGS.drop_threshold,
    keyword_drop_threshold: settings.keyword_drop_threshold ?? DEFAULT_NOTIFICATION_SETTINGS.keyword_drop_threshold,
    comparison_days: settings.comparison_days ?? DEFAULT_NOTIFICATION_SETTINGS.comparison_days,
    consecutive_drop_days: settings.consecutive_drop_days ?? DEFAULT_NOTIFICATION_SETTINGS.consecutive_drop_days,
    min_impressions: settings.min_impressions ?? DEFAULT_NOTIFICATION_SETTINGS.min_impressions,
    notification_cooldown_days: settings.notification_cooldown_days ?? DEFAULT_NOTIFICATION_SETTINGS.notification_cooldown_days,
    notification_time: settings.notification_time ?? '09:00:00',
    timezone: settings.timezone ?? null, // NULLの場合はusersテーブルのタイムゾーンを使用
    updated_at: new Date().toISOString(),
  };

  // 既存の設定を検索
  const { data: existing } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('article_id', articleId || null)
    .eq('notification_type', settings.notification_type)
    .eq('channel', settings.channel)
    .single();

  if (existing) {
    // 更新
    const { data, error } = await supabase
      .from('notification_settings')
      .update(settingsData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update notification settings: ${error.message}`);
    }

    return data as NotificationSettings;
  }

  // 新規作成
  const { data, error } = await supabase
    .from('notification_settings')
    .insert(settingsData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create notification settings: ${error.message}`);
  }

  return data as NotificationSettings;
}

