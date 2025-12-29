import { createSupabaseClient } from '@/lib/supabase';

export interface SlackIntegration {
  id: string;
  user_id: string;
  slack_bot_token: string;
  slack_user_id: string | null;
  slack_team_id: string;
  slack_channel_id: string | null;
  slack_notification_type: 'channel' | 'dm';
  created_at: string;
  updated_at: string;
}

/**
 * ユーザーのSlack連携情報を取得
 */
export async function getSlackIntegrationByUserId(
  userId: string
): Promise<SlackIntegration | null> {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('slack_integrations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Slack Integration DB] Error fetching Slack integration:', error);
    return null;
  }

  return data as SlackIntegration | null;
}

/**
 * Slack連携情報を作成または更新
 */
export async function saveOrUpdateSlackIntegration(
  userId: string,
  integration: {
    slack_bot_token: string;
    slack_user_id?: string | null;
    slack_team_id: string;
    slack_channel_id?: string | null;
    slack_notification_type?: 'channel' | 'dm';
  }
): Promise<SlackIntegration> {
  const supabase = createSupabaseClient();

  const integrationData = {
    user_id: userId,
    slack_bot_token: integration.slack_bot_token,
    slack_user_id: integration.slack_user_id || null,
    slack_team_id: integration.slack_team_id,
    slack_channel_id: integration.slack_channel_id || null,
    slack_notification_type: integration.slack_notification_type || 'channel',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('slack_integrations')
    .upsert(integrationData, {
      onConflict: 'user_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[Slack Integration DB] Error saving Slack integration:', error);
    throw new Error(`Failed to save Slack integration: ${error.message}`);
  }

  return data as SlackIntegration;
}

/**
 * Slack連携を削除
 */
export async function deleteSlackIntegration(userId: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('slack_integrations')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[Slack Integration DB] Error deleting Slack integration:', error);
    throw new Error(`Failed to delete Slack integration: ${error.message}`);
  }
}

