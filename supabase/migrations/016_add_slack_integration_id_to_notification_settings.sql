-- notification_settingsにslack_integration_idを追加
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- notification_settingsにslack_integration_idを追加
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS slack_integration_id UUID REFERENCES slack_integrations(id) ON DELETE SET NULL;

-- 既存のレコードに対してslack_integration_idを設定
UPDATE notification_settings ns
SET slack_integration_id = si.id
FROM slack_integrations si
WHERE ns.user_id = si.user_id
  AND ns.slack_bot_token IS NOT NULL
  AND ns.article_id IS NULL
  AND ns.channel = 'slack';

-- インデックスの追加
CREATE INDEX IF NOT EXISTS idx_notification_settings_slack_integration_id 
  ON notification_settings(slack_integration_id) 
  WHERE slack_integration_id IS NOT NULL;

