-- パフォーマンス最適化のためのインデックス追加
-- 実行日時: 2024-01-XX

-- articlesテーブルのインデックス
-- user_idは既に存在する可能性があるが、明示的に追加（IF NOT EXISTSで安全）
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_site_id ON articles(site_id);
CREATE INDEX IF NOT EXISTS idx_articles_last_analyzed_at ON articles(last_analyzed_at);
CREATE INDEX IF NOT EXISTS idx_articles_is_monitoring ON articles(is_monitoring);
CREATE INDEX IF NOT EXISTS idx_articles_is_fixed ON articles(is_fixed);
-- 複合インデックス（よく使われる組み合わせ）
CREATE INDEX IF NOT EXISTS idx_articles_user_id_site_id ON articles(user_id, site_id);
CREATE INDEX IF NOT EXISTS idx_articles_user_id_is_monitoring ON articles(user_id, is_monitoring);
CREATE INDEX IF NOT EXISTS idx_articles_user_id_is_fixed ON articles(user_id, is_fixed);

-- analysis_resultsテーブルのインデックス
-- article_idとcreated_atは既に存在する可能性があるが、明示的に追加
CREATE INDEX IF NOT EXISTS idx_analysis_results_article_id_created_at ON analysis_results(article_id, created_at DESC);

-- analysis_runsテーブル
-- 既存のインデックスを確認（001_initial_schema.sqlで作成されている可能性がある）

-- notification_settingsテーブル
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id_article_id ON notification_settings(user_id, article_id);

-- notificationsテーブル
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read_at ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC);

