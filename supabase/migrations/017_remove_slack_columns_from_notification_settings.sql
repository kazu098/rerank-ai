-- notification_settingsテーブルからSlack関連カラムを削除
-- slack_integrationsテーブルに正規化したため、これらのカラムは不要
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- 注意: このマイグレーションを実行する前に、015_migrate_slack_data_to_integrations.sqlが正常に実行されていることを確認してください

-- Slack関連のカラムを削除
ALTER TABLE notification_settings
  DROP COLUMN IF EXISTS slack_bot_token,
  DROP COLUMN IF EXISTS slack_user_id,
  DROP COLUMN IF EXISTS slack_team_id,
  DROP COLUMN IF EXISTS slack_channel_id,
  DROP COLUMN IF EXISTS slack_notification_type;

-- 削除されたカラムのインデックスも削除（存在する場合）
DROP INDEX IF EXISTS idx_notification_settings_slack_bot_token;
DROP INDEX IF EXISTS idx_notification_settings_slack_user_id;

