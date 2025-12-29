-- アラート設定をnotification_settingsからuser_alert_settingsに移行
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- 1. user_alert_settingsテーブルにnotification_timeとtimezoneを追加
ALTER TABLE user_alert_settings
  ADD COLUMN IF NOT EXISTS notification_time TIME DEFAULT '09:00:00' NOT NULL,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50); -- NULLの場合はusersテーブルのタイムゾーンを使用

-- 2. 既存のnotification_settingsからnotification_timeとtimezoneをuser_alert_settingsに移行
--    (article_idがNULLのレコードから取得)
UPDATE user_alert_settings uas
SET 
  notification_time = COALESCE(
    (SELECT notification_time FROM notification_settings 
     WHERE user_id = uas.user_id AND article_id IS NULL 
     ORDER BY updated_at DESC LIMIT 1),
    '09:00:00'
  ),
  timezone = (
    SELECT timezone FROM notification_settings 
    WHERE user_id = uas.user_id AND article_id IS NULL 
    ORDER BY updated_at DESC LIMIT 1
  )
WHERE EXISTS (
  SELECT 1 FROM notification_settings 
  WHERE user_id = uas.user_id AND article_id IS NULL
);

-- 3. notification_settingsテーブルからアラート設定関連のカラムを削除
ALTER TABLE notification_settings
  DROP COLUMN IF EXISTS drop_threshold,
  DROP COLUMN IF EXISTS keyword_drop_threshold,
  DROP COLUMN IF EXISTS comparison_days,
  DROP COLUMN IF EXISTS consecutive_drop_days,
  DROP COLUMN IF EXISTS min_impressions,
  DROP COLUMN IF EXISTS notification_cooldown_days,
  DROP COLUMN IF EXISTS notification_time,
  DROP COLUMN IF EXISTS timezone;

