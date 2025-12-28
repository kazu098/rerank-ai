-- Slack Webhook URLカラムを削除（OAuth方式のみに統一）
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- notification_settingsテーブルからslack_webhook_urlカラムを削除
ALTER TABLE notification_settings 
  DROP COLUMN IF EXISTS slack_webhook_url;

