-- notificationsテーブルに通知内容の詳細データを保存するJSONBカラムを追加
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS notification_data JSONB;

-- インデックスの追加（通知送信cronジョブのパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at 
  ON notifications(sent_at) 
  WHERE sent_at IS NULL;

