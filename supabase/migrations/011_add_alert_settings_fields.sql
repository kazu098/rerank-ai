-- user_alert_settingsテーブルに追加のフィールドを追加
ALTER TABLE user_alert_settings
ADD COLUMN IF NOT EXISTS consecutive_drop_days INTEGER DEFAULT 3 NOT NULL,
ADD COLUMN IF NOT EXISTS min_impressions INTEGER DEFAULT 100 NOT NULL,
ADD COLUMN IF NOT EXISTS notification_cooldown_days INTEGER DEFAULT 7 NOT NULL;

-- position_drop_thresholdの精度を上げる（0.1刻みに対応）
ALTER TABLE user_alert_settings
ALTER COLUMN position_drop_threshold TYPE DECIMAL(5,2);

