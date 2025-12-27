-- 通知システム用のスキーマ更新
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- articlesテーブルに通知関連のカラムを追加
ALTER TABLE articles 
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS fixed_notification_id UUID REFERENCES notifications(id),
  ADD COLUMN IF NOT EXISTS last_notification_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS notification_count_last_7_days INTEGER DEFAULT 0;

-- notificationsテーブルに通知キーと優先度を追加
ALTER TABLE notifications 
  ADD COLUMN IF NOT EXISTS notification_key VARCHAR(255), -- 記事ID + キーワードのハッシュ（重複チェック用）
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium', -- 'high', 'medium', 'low'
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT false;

-- notification_settingsテーブルに通知判定用のカラムを追加
ALTER TABLE notification_settings 
  ADD COLUMN IF NOT EXISTS consecutive_drop_days INTEGER DEFAULT 3, -- 連続下落日数の閾値
  ADD COLUMN IF NOT EXISTS min_impressions INTEGER DEFAULT 100, -- 最小インプレッション数
  ADD COLUMN IF NOT EXISTS notification_cooldown_days INTEGER DEFAULT 7; -- 通知のクールダウン期間

-- インデックスの追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_articles_is_fixed ON articles(is_fixed) WHERE is_fixed = true;
CREATE INDEX IF NOT EXISTS idx_articles_last_notification_sent_at ON articles(last_notification_sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_key ON notifications(notification_key);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at_priority ON notifications(sent_at DESC, priority);

