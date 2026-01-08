import { createSupabaseClient } from '@/lib/supabase';
import { getSlackIntegrationByUserId } from './slack-integrations';

export interface NotificationSettings {
  id: string;
  user_id: string;
  article_id: string | null;
  notification_type: string;
  channel: string;
  recipient: string;
  is_enabled: boolean;
  slack_integration_id: string | null; // slack_integrationsテーブルへの参照
  // 後方互換性のため、slack_integrationsから取得した情報を動的に追加
  slack_bot_token?: string | null;
  slack_user_id?: string | null;
  slack_team_id?: string | null;
  slack_channel_id?: string | null;
  slack_notification_type?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * デフォルトの通知設定
 */
export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettings, 'id' | 'user_id' | 'article_id' | 'notification_type' | 'channel' | 'recipient' | 'created_at' | 'updated_at'> = {
  is_enabled: true,
  slack_integration_id: null,
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

  // 記事固有の設定を取得（is_enabledに関係なく取得 - slack_bot_tokenを取得するため）
  if (articleId) {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('article_id', articleId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      // slack_integration_idがある場合は、slack_integrationsテーブルから情報を取得
      if (data.slack_integration_id) {
        const { createSupabaseClient } = await import('@/lib/supabase');
        const supabase = createSupabaseClient();
        const { data: integrationData } = await supabase
          .from('slack_integrations')
          .select('*')
          .eq('id', data.slack_integration_id)
          .maybeSingle();
        
        if (integrationData) {
          // 後方互換性のため、slack_integrationsの情報を設定に追加
          (data as any).slack_bot_token = integrationData.slack_bot_token;
          (data as any).slack_user_id = integrationData.slack_user_id;
          (data as any).slack_team_id = integrationData.slack_team_id;
          (data as any).slack_channel_id = integrationData.slack_channel_id;
          (data as any).slack_notification_type = integrationData.slack_notification_type;
        }
      } else if (!data.slack_bot_token) {
        // slack_integration_idがなく、slack_bot_tokenもない場合は、slack_integrationsテーブルから取得を試みる
        const slackIntegration = await getSlackIntegrationByUserId(userId);
        if (slackIntegration) {
          (data as any).slack_bot_token = slackIntegration.slack_bot_token;
          (data as any).slack_user_id = slackIntegration.slack_user_id;
          (data as any).slack_team_id = slackIntegration.slack_team_id;
          (data as any).slack_channel_id = slackIntegration.slack_channel_id;
          (data as any).slack_notification_type = slackIntegration.slack_notification_type;
          (data as any).slack_integration_id = slackIntegration.id;
        }
      }
      
      console.log('[Notification Settings DB] Found article-specific settings:', {
        id: data.id,
        is_enabled: data.is_enabled,
        hasSlackIntegrationId: !!data.slack_integration_id,
        hasSlackBotToken: !!data.slack_bot_token,
        slackChannelId: data.slack_channel_id,
      });
      return data as NotificationSettings;
    }
  }

  // 記事固有の設定がない場合、ユーザー全体のデフォルト設定を取得（article_idがnull、is_enabledに関係なく取得）
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .is('article_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    // slack_integration_idがある場合は、slack_integrationsテーブルから情報を取得
    if (data.slack_integration_id) {
      const { createSupabaseClient } = await import('@/lib/supabase');
      const supabase = createSupabaseClient();
      const { data: integrationData } = await supabase
        .from('slack_integrations')
        .select('*')
        .eq('id', data.slack_integration_id)
        .maybeSingle();
      
      if (integrationData) {
        // 後方互換性のため、slack_integrationsの情報を設定に追加
        (data as any).slack_bot_token = integrationData.slack_bot_token;
        (data as any).slack_user_id = integrationData.slack_user_id;
        (data as any).slack_team_id = integrationData.slack_team_id;
        (data as any).slack_channel_id = integrationData.slack_channel_id;
        (data as any).slack_notification_type = integrationData.slack_notification_type;
      }
    } else if (!data.slack_bot_token) {
      // slack_integration_idがなく、slack_bot_tokenもない場合は、slack_integrationsテーブルから取得を試みる
      const slackIntegration = await getSlackIntegrationByUserId(userId);
      if (slackIntegration) {
        (data as any).slack_bot_token = slackIntegration.slack_bot_token;
        (data as any).slack_user_id = slackIntegration.slack_user_id;
        (data as any).slack_team_id = slackIntegration.slack_team_id;
        (data as any).slack_channel_id = slackIntegration.slack_channel_id;
        (data as any).slack_notification_type = slackIntegration.slack_notification_type;
        (data as any).slack_integration_id = slackIntegration.id;
      }
    }
    
    console.log('[Notification Settings DB] Found default settings:', {
      id: data.id,
      is_enabled: data.is_enabled,
      hasSlackIntegrationId: !!data.slack_integration_id,
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
 * ユーザーの通知設定をチャネル別に取得（メールとSlackを別々に取得）
 * 
 * @param userId ユーザーID
 * @param articleId 記事ID（オプション、nullの場合はデフォルト設定）
 * @returns メール設定とSlack設定のオブジェクト
 */
export async function getNotificationSettingsByChannel(
  userId: string,
  articleId?: string | null
): Promise<{
  email: NotificationSettings | null;
  slack: NotificationSettings | null;
}> {
  const supabase = createSupabaseClient();

  // 記事固有の設定を取得
  if (articleId) {
    const { data: articleSettings, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('article_id', articleId)
      .order('updated_at', { ascending: false });

    if (!error && articleSettings && articleSettings.length > 0) {
      const emailSetting = articleSettings.find(s => s.channel === 'email');
      const slackSetting = articleSettings.find(s => s.channel === 'slack');

      // Slack設定のslack_integration_idから情報を取得
      if (slackSetting?.slack_integration_id) {
        const { data: integrationData } = await supabase
          .from('slack_integrations')
          .select('*')
          .eq('id', slackSetting.slack_integration_id)
          .maybeSingle();
        
        if (integrationData) {
          (slackSetting as any).slack_bot_token = integrationData.slack_bot_token;
          (slackSetting as any).slack_user_id = integrationData.slack_user_id;
          (slackSetting as any).slack_team_id = integrationData.slack_team_id;
          (slackSetting as any).slack_channel_id = integrationData.slack_channel_id;
          (slackSetting as any).slack_notification_type = integrationData.slack_notification_type;
        }
      } else if (slackSetting && !slackSetting.slack_bot_token) {
        // slack_integration_idがなく、slack_bot_tokenもない場合は、slack_integrationsテーブルから取得を試みる
        const slackIntegration = await getSlackIntegrationByUserId(userId);
        if (slackIntegration) {
          (slackSetting as any).slack_bot_token = slackIntegration.slack_bot_token;
          (slackSetting as any).slack_user_id = slackIntegration.slack_user_id;
          (slackSetting as any).slack_team_id = slackIntegration.slack_team_id;
          (slackSetting as any).slack_channel_id = slackIntegration.slack_channel_id;
          (slackSetting as any).slack_notification_type = slackIntegration.slack_notification_type;
          (slackSetting as any).slack_integration_id = slackIntegration.id;
        }
      }

      return {
        email: emailSetting ? (emailSetting as NotificationSettings) : null,
        slack: slackSetting ? (slackSetting as NotificationSettings) : null,
      };
    }
  }

  // デフォルト設定を取得（article_idがnull）
  const { data: defaultSettings, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .is('article_id', null)
    .order('updated_at', { ascending: false });

  if (!error && defaultSettings && defaultSettings.length > 0) {
    const emailSetting = defaultSettings.find(s => s.channel === 'email');
    const slackSetting = defaultSettings.find(s => s.channel === 'slack');

    // Slack設定のslack_integration_idから情報を取得
    if (slackSetting?.slack_integration_id) {
      const { data: integrationData } = await supabase
        .from('slack_integrations')
        .select('*')
        .eq('id', slackSetting.slack_integration_id)
        .maybeSingle();
      
      if (integrationData) {
        (slackSetting as any).slack_bot_token = integrationData.slack_bot_token;
        (slackSetting as any).slack_user_id = integrationData.slack_user_id;
        (slackSetting as any).slack_team_id = integrationData.slack_team_id;
        (slackSetting as any).slack_channel_id = integrationData.slack_channel_id;
        (slackSetting as any).slack_notification_type = integrationData.slack_notification_type;
      }
    } else if (slackSetting && !slackSetting.slack_bot_token) {
      // slack_integration_idがなく、slack_bot_tokenもない場合は、slack_integrationsテーブルから取得を試みる
      const slackIntegration = await getSlackIntegrationByUserId(userId);
      if (slackIntegration) {
        (slackSetting as any).slack_bot_token = slackIntegration.slack_bot_token;
        (slackSetting as any).slack_user_id = slackIntegration.slack_user_id;
        (slackSetting as any).slack_team_id = slackIntegration.slack_team_id;
        (slackSetting as any).slack_channel_id = slackIntegration.slack_channel_id;
        (slackSetting as any).slack_notification_type = slackIntegration.slack_notification_type;
        (slackSetting as any).slack_integration_id = slackIntegration.id;
      }
    }

    return {
      email: emailSetting ? (emailSetting as NotificationSettings) : null,
      slack: slackSetting ? (slackSetting as NotificationSettings) : null,
    };
  }

  // 設定が存在しない場合、slack_integrationsテーブルから直接取得を試みる（Slackのみ）
  const slackIntegration = await getSlackIntegrationByUserId(userId);
  if (slackIntegration) {
    const recipient = slackIntegration.slack_notification_type === 'dm'
      ? (slackIntegration.slack_user_id || '')
      : (slackIntegration.slack_channel_id || '');
    
    const slackSetting: NotificationSettings = {
      id: '',
      user_id: userId,
      article_id: null,
      notification_type: 'rank_drop',
      channel: 'slack',
      recipient: recipient,
      is_enabled: true,
      slack_integration_id: slackIntegration.id,
      slack_bot_token: slackIntegration.slack_bot_token,
      slack_user_id: slackIntegration.slack_user_id,
      slack_team_id: slackIntegration.slack_team_id,
      slack_channel_id: slackIntegration.slack_channel_id,
      slack_notification_type: slackIntegration.slack_notification_type,
      created_at: slackIntegration.created_at,
      updated_at: slackIntegration.updated_at,
    };

    return {
      email: null,
      slack: slackSetting,
    };
  }

  return {
    email: null,
    slack: null,
  };
}

/**
 * 複数の記事に対する通知設定を一括取得
 * 返り値: Map<articleId, { email: boolean | null, slack: boolean | null }>
 * - true: 有効、false: 無効、null: デフォルト設定を使用（記事固有の設定がない）
 */
export async function getNotificationSettingsForArticles(
  userId: string,
  articleIds: string[]
): Promise<Map<string, { email: boolean | null; slack: boolean | null }>> {
  const supabase = createSupabaseClient();
  const result = new Map<string, { email: boolean | null; slack: boolean | null }>();

  if (articleIds.length === 0) {
    return result;
  }

  // デフォルト設定を取得（article_idがnull）
  const { data: defaultSettings } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .is('article_id', null)
    .eq('is_enabled', true);

  const defaultEmailEnabled = defaultSettings?.some(s => s.channel === 'email') ?? null;
  const defaultSlackEnabled = defaultSettings?.some(s => s.channel === 'slack') ?? null;

  // 記事固有の設定を取得（is_enabledに関わらず全て取得）
  const { data: articleSettings } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .in('article_id', articleIds)
    .eq('notification_type', 'rank_drop')
    .order('updated_at', { ascending: false }); // 最新のものを優先

  // 各記事・各チャネルごとに最新の設定のみを使用（重複を除去）
  const articleSettingsMap = new Map<string, Map<string, NotificationSettings>>();
  
  if (articleSettings) {
    articleSettings.forEach(setting => {
      const articleId = setting.article_id!;
      const channel = setting.channel;
      
      if (!articleSettingsMap.has(articleId)) {
        articleSettingsMap.set(articleId, new Map());
      }
      
      const channelMap = articleSettingsMap.get(articleId)!;
      // 既に同じチャネルの設定がある場合は、より新しいものを使用（既にupdated_atでソート済み）
      if (!channelMap.has(channel)) {
        channelMap.set(channel, setting as NotificationSettings);
      }
    });
  }

  // 各記事の設定を初期化（デフォルト値で）
  articleIds.forEach(articleId => {
    result.set(articleId, {
      email: null, // null = デフォルト設定を使用
      slack: null, // null = デフォルト設定を使用
    });
  });

  // 記事固有の設定があれば上書き
  articleSettingsMap.forEach((channelMap, articleId) => {
    const current = result.get(articleId) || { email: null, slack: null };
    
    const emailSetting = channelMap.get('email');
    const slackSetting = channelMap.get('slack');
    
    if (emailSetting) {
      current.email = emailSetting.is_enabled; // true/falseを設定（デフォルトではないことを示す）
    }
    
    if (slackSetting) {
      current.slack = slackSetting.is_enabled; // true/falseを設定（デフォルトではないことを示す）
    }
    
    result.set(articleId, current);
  });

  return result;
}
