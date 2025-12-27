-- Slack OAuth連携用のスキーマ更新
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- notification_settingsテーブルにSlack OAuth関連のカラムを追加
ALTER TABLE notification_settings 
  ADD COLUMN IF NOT EXISTS slack_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(50), -- Slack User ID (Uで始まる)
  ADD COLUMN IF NOT EXISTS slack_team_id VARCHAR(50), -- Slack Team ID (Tで始まる)
  ADD COLUMN IF NOT EXISTS slack_channel_id VARCHAR(50), -- チャンネルIDまたはUser ID (DM送信の場合)
  ADD COLUMN IF NOT EXISTS slack_notification_type VARCHAR(20) DEFAULT 'channel'; -- 'channel' or 'dm'

-- インデックスの追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_notification_settings_slack_bot_token 
  ON notification_settings(slack_bot_token) 
  WHERE slack_bot_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_settings_slack_user_id 
  ON notification_settings(slack_user_id) 
  WHERE slack_user_id IS NOT NULL;

