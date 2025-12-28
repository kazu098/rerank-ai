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
  slack_webhook_url: string | null; // Slack Webhook URL（旧方式）
  slack_bot_token: string | null; // Slack Bot Token（OAuth方式）
  slack_user_id: string | null; // Slack User ID（Uで始まる）
  slack_team_id: string | null; // Slack Team ID（Tで始まる）
  slack_channel_id: string | null; // チャンネルIDまたはUser ID（DM送信の場合）
  slack_notification_type: string | null; // 'channel' or 'dm'
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
  notification_time: '09:00:00',
  timezone: null,
  slack_webhook_url: null,
  slack_bot_token: null,
  slack_user_id: null,
  slack_team_id: null,
  slack_channel_id: null,
  slack_notification_type: null,
};

/**
 * ユーザーの通知設定を取得（記事IDが指定されている場合は記事固有の設定、nullの場合はデフォルト設定）
 */
export async function getNotificationSettings(
  userId: string,
  articleId?: string | null
): Promise<NotificationSettings | null> {
  console.log('[Notification Settings DB] getNotificationSettings called:', {
    userId,
    articleId: articleId || null,
  });

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
      console.log('[Notification Settings DB] Found article-specific settings:', {
        id: data.id,
        is_enabled: data.is_enabled,
        hasSlackBotToken: !!data.slack_bot_token,
        slackChannelId: data.slack_channel_id,
      });
      return data as NotificationSettings;
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
    console.log('[Notification Settings DB] Found default settings:', {
      id: data.id,
      is_enabled: data.is_enabled,
      hasSlackBotToken: !!data.slack_bot_token,
      slackBotTokenIsNull: data.slack_bot_token === null,
      slackChannelId: data.slack_channel_id,
      slackNotificationType: data.slack_notification_type,
    });
    return data as NotificationSettings;
  }

  console.log('[Notification Settings DB] No settings found', {
    error: error?.message,
    errorCode: error?.code,
  });

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
  console.log('[Notification Settings DB] saveOrUpdateNotificationSettings called:', {
    userId,
    articleId: articleId || null,
    notification_type: settings.notification_type,
    channel: settings.channel,
    is_enabled: settings.is_enabled,
    hasSlackBotToken: settings.slack_bot_token !== undefined,
    slackBotTokenIsNull: settings.slack_bot_token === null,
    slackChannelId: settings.slack_channel_id,
    slackNotificationType: settings.slack_notification_type,
  });

  const supabase = createSupabaseClient();

  const settingsData: any = {
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
    slack_webhook_url: settings.slack_webhook_url ?? null,
    updated_at: new Date().toISOString(),
  };

  // Slack OAuth関連のフィールドを追加（提供されている場合）
  if (settings.slack_bot_token !== undefined) {
    settingsData.slack_bot_token = settings.slack_bot_token;
    console.log('[Notification Settings DB] slack_bot_token set:', settings.slack_bot_token === null ? 'null' : 'present');
  }
  if (settings.slack_user_id !== undefined) {
    settingsData.slack_user_id = settings.slack_user_id;
  }
  if (settings.slack_team_id !== undefined) {
    settingsData.slack_team_id = settings.slack_team_id;
  }
  if (settings.slack_channel_id !== undefined) {
    settingsData.slack_channel_id = settings.slack_channel_id;
  }
  if (settings.slack_notification_type !== undefined) {
    settingsData.slack_notification_type = settings.slack_notification_type;
  }

  console.log('[Notification Settings DB] Settings data to save:', {
    is_enabled: settingsData.is_enabled,
    hasSlackBotToken: settingsData.slack_bot_token !== undefined,
    slackBotTokenIsNull: settingsData.slack_bot_token === null,
    slackChannelId: settingsData.slack_channel_id,
    slackNotificationType: settingsData.slack_notification_type,
  });

  // 既存の設定を検索（is_enabledの条件は入れない - falseのレコードも見つけるため）
  try {
    // まず、複数のレコードが存在する可能性があるため、すべて取得してから最新のものを選択
    let query = supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId);
    
    // article_idがnullの場合は.is()を使い、値がある場合は.eq()を使う
    if (articleId === null || articleId === undefined) {
      query = query.is('article_id', null);
    } else {
      query = query.eq('article_id', articleId);
    }
    
    const { data: existingRecords, error: searchError } = await query
      .eq('notification_type', settings.notification_type)
      .eq('channel', settings.channel)
      .order('updated_at', { ascending: false });

    if (searchError) {
      console.error('[Notification Settings DB] Error searching for existing settings:', {
        error: searchError.message,
        code: searchError.code,
        details: searchError.details,
        hint: searchError.hint,
      });
      throw new Error(`Failed to search notification settings: ${searchError.message} (code: ${searchError.code})`);
    }

    // 既存のレコードが見つかった場合、最新のものを使用（複数ある場合は最新のものを更新）
    const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

    if (existingRecords && existingRecords.length > 1) {
      console.warn('[Notification Settings DB] Multiple settings found, using the most recent one:', {
        totalCount: existingRecords.length,
        usingId: existing?.id,
        allIds: existingRecords.map(r => r.id),
      });
    }

    if (!existing) {
      console.log('[Notification Settings DB] No existing settings found (will create new)');
    }

    if (existing) {
      console.log('[Notification Settings DB] Updating existing settings:', {
        id: existing.id,
        currentIsEnabled: existing.is_enabled,
        currentHasSlackBotToken: !!existing.slack_bot_token,
        newIsEnabled: settingsData.is_enabled,
        newHasSlackBotToken: settingsData.slack_bot_token !== undefined,
      });
      // 更新
      const { data, error } = await supabase
        .from('notification_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('[Notification Settings DB] Error updating settings:', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(`Failed to update notification settings: ${error.message} (code: ${error.code})`);
      }

      console.log('[Notification Settings DB] Settings updated successfully:', {
        id: data.id,
        is_enabled: data.is_enabled,
        hasSlackBotToken: !!data.slack_bot_token,
        slackBotTokenIsNull: data.slack_bot_token === null,
      });

      return data as NotificationSettings;
    }

    console.log('[Notification Settings DB] Creating new settings');
    // 新規作成
    const { data, error } = await supabase
      .from('notification_settings')
      .insert(settingsData)
      .select()
      .single();

    if (error) {
      console.error('[Notification Settings DB] Error creating settings:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw new Error(`Failed to create notification settings: ${error.message} (code: ${error.code})`);
    }

    console.log('[Notification Settings DB] Settings created successfully:', {
      id: data.id,
      is_enabled: data.is_enabled,
      hasSlackBotToken: !!data.slack_bot_token,
    });

    return data as NotificationSettings;
  } catch (dbError: any) {
    console.error('[Notification Settings DB] Database operation failed:', {
      error: dbError.message,
      stack: dbError.stack,
      name: dbError.name,
    });
    throw dbError;
  }
}

