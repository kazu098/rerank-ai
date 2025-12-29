-- 既存のnotification_settingsからSlack情報をslack_integrationsに移行
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- notification_settingsからSlack情報を取得してslack_integrationsに移行
-- 1ユーザーにつき1つのSlack連携のみを想定（最新の設定を使用）
INSERT INTO slack_integrations (
  user_id,
  slack_bot_token,
  slack_user_id,
  slack_team_id,
  slack_channel_id,
  slack_notification_type,
  created_at,
  updated_at
)
SELECT DISTINCT ON (user_id)
  user_id,
  slack_bot_token,
  slack_user_id,
  slack_team_id,
  slack_channel_id,
  slack_notification_type,
  created_at,
  updated_at
FROM notification_settings
WHERE slack_bot_token IS NOT NULL
  AND article_id IS NULL
  AND channel = 'slack'
ORDER BY user_id, updated_at DESC
ON CONFLICT (user_id) DO UPDATE SET
  slack_bot_token = EXCLUDED.slack_bot_token,
  slack_user_id = EXCLUDED.slack_user_id,
  slack_team_id = EXCLUDED.slack_team_id,
  slack_channel_id = EXCLUDED.slack_channel_id,
  slack_notification_type = EXCLUDED.slack_notification_type,
  updated_at = EXCLUDED.updated_at;

