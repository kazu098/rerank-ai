-- タイムゾーン対応のスキーマ更新
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- usersテーブルにタイムゾーンを追加
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';

-- notification_settingsテーブルに通知時刻とタイムゾーンを追加
ALTER TABLE notification_settings 
  ADD COLUMN IF NOT EXISTS notification_time TIME DEFAULT '09:00:00',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50); -- NULLの場合はusersテーブルのタイムゾーンを使用

-- インデックスの追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_users_timezone ON users(timezone);

