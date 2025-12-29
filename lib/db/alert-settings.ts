import { createSupabaseClient } from '@/lib/supabase';

export interface UserAlertSettings {
  user_id: string;
  position_drop_threshold: number;  // 平均順位の下落幅（デフォルト: 2.0）
  keyword_drop_threshold: number;   // 特定キーワードの転落条件（デフォルト: 10）
  comparison_days: number;          // 過去何日間の平均順位（デフォルト: 7）
  consecutive_drop_days: number;    // 連続下落日数（デフォルト: 3）
  min_impressions: number;          // 最小インプレッション数（デフォルト: 100）
  notification_cooldown_days: number; // 通知クールダウン日数（デフォルト: 7）
  notification_frequency: 'daily' | 'weekly' | 'none'; // 通知頻度（デフォルト: 'daily'）
  notification_time: string;        // 通知時刻（TIME型、例: '09:00:00'）
  timezone: string | null;          // タイムゾーン（例: 'Asia/Tokyo'、NULLの場合はusersテーブルのタイムゾーンを使用）
  created_at: string;
  updated_at: string;
}

/**
 * デフォルトのアラート設定
 */
export const DEFAULT_ALERT_SETTINGS: Omit<UserAlertSettings, 'user_id' | 'created_at' | 'updated_at'> = {
  position_drop_threshold: 2.0,
  keyword_drop_threshold: 10,
  comparison_days: 7,
  consecutive_drop_days: 3,
  min_impressions: 100,
  notification_cooldown_days: 7,
  notification_frequency: 'daily',
  notification_time: '09:00:00',
  timezone: null,
};

/**
 * ユーザーのアラート設定を取得
 * 設定が存在しない場合はデフォルト値を返す
 */
export async function getUserAlertSettings(userId: string): Promise<Omit<UserAlertSettings, 'user_id' | 'created_at' | 'updated_at'>> {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('user_alert_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // 設定が存在しない場合はデフォルト値を返す
    return DEFAULT_ALERT_SETTINGS;
  }

  return {
    position_drop_threshold: data.position_drop_threshold ?? DEFAULT_ALERT_SETTINGS.position_drop_threshold,
    keyword_drop_threshold: data.keyword_drop_threshold ?? DEFAULT_ALERT_SETTINGS.keyword_drop_threshold,
    comparison_days: data.comparison_days ?? DEFAULT_ALERT_SETTINGS.comparison_days,
    consecutive_drop_days: data.consecutive_drop_days ?? DEFAULT_ALERT_SETTINGS.consecutive_drop_days,
    min_impressions: data.min_impressions ?? DEFAULT_ALERT_SETTINGS.min_impressions,
    notification_cooldown_days: data.notification_cooldown_days ?? DEFAULT_ALERT_SETTINGS.notification_cooldown_days,
    notification_frequency: (data.notification_frequency as 'daily' | 'weekly' | 'none') ?? DEFAULT_ALERT_SETTINGS.notification_frequency,
    notification_time: data.notification_time ?? DEFAULT_ALERT_SETTINGS.notification_time,
    timezone: data.timezone ?? DEFAULT_ALERT_SETTINGS.timezone,
  };
}

/**
 * ユーザーのアラート設定を保存または更新
 */
export async function saveOrUpdateUserAlertSettings(
  userId: string,
  settings: Partial<Omit<UserAlertSettings, 'user_id' | 'created_at' | 'updated_at'>>
): Promise<UserAlertSettings> {
  const supabase = createSupabaseClient();

  const settingsData: any = {
    user_id: userId,
    position_drop_threshold: settings.position_drop_threshold ?? DEFAULT_ALERT_SETTINGS.position_drop_threshold,
    keyword_drop_threshold: settings.keyword_drop_threshold ?? DEFAULT_ALERT_SETTINGS.keyword_drop_threshold,
    comparison_days: settings.comparison_days ?? DEFAULT_ALERT_SETTINGS.comparison_days,
    consecutive_drop_days: settings.consecutive_drop_days ?? DEFAULT_ALERT_SETTINGS.consecutive_drop_days,
    min_impressions: settings.min_impressions ?? DEFAULT_ALERT_SETTINGS.min_impressions,
    notification_cooldown_days: settings.notification_cooldown_days ?? DEFAULT_ALERT_SETTINGS.notification_cooldown_days,
    notification_frequency: settings.notification_frequency ?? DEFAULT_ALERT_SETTINGS.notification_frequency,
    notification_time: settings.notification_time ?? DEFAULT_ALERT_SETTINGS.notification_time,
    timezone: settings.timezone !== undefined ? settings.timezone : DEFAULT_ALERT_SETTINGS.timezone,
    updated_at: new Date().toISOString(),
  };

  // 既存の設定を確認
  const { data: existing } = await supabase
    .from('user_alert_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    // 更新
    const { data, error } = await supabase
      .from('user_alert_settings')
      .update(settingsData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update alert settings: ${error.message}`);
    }

    return data as UserAlertSettings;
  } else {
    // 新規作成
    const { data, error } = await supabase
      .from('user_alert_settings')
      .insert(settingsData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create alert settings: ${error.message}`);
    }

    return data as UserAlertSettings;
  }
}

