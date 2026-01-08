-- 初期スキーマの作成
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- 1. plans（プラン）テーブル
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  price_monthly INTEGER NOT NULL,
  max_articles INTEGER, -- NULLは無制限を意味する
  max_analyses_per_month INTEGER, -- NULLは無制限を意味する
  max_sites INTEGER, -- NULLは無制限を意味する
  max_concurrent_analyses INTEGER DEFAULT 1,
  features JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- プランの初期データ
-- display_nameは英語で保存（多言語対応はアプリケーション側で実装）
INSERT INTO plans (name, display_name, price_monthly, max_articles, max_analyses_per_month, max_sites, max_concurrent_analyses) VALUES
('free', 'Free', 0, 3, 7, 1, 1),
('starter', 'Starter', 2980, 20, 20, 1, 1),
('standard', 'Standard', 9800, 100, 100, 3, 3),
('business', 'Business', 29800, NULL, NULL, NULL, 10)
ON CONFLICT (name) DO NOTHING;

-- 2. users（ユーザー）テーブル
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255), -- OAuthの場合はNULL
  provider VARCHAR(50), -- 'email', 'google', 'github' など
  provider_id VARCHAR(255), -- OAuthプロバイダーのID
  plan_id UUID REFERENCES plans(id),
  plan_started_at TIMESTAMP WITH TIME ZONE,
  plan_ends_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

-- 3. sites（サイト - GSC連携用）テーブル
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_url VARCHAR(500) NOT NULL,
  display_name VARCHAR(255),
  gsc_access_token TEXT, -- 暗号化必須（後で実装）
  gsc_refresh_token TEXT, -- 暗号化必須（後で実装）
  gsc_token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  is_trial BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, site_url)
);

CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active) WHERE is_active = true;

-- 4. articles（記事URL）テーブル
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  url VARCHAR(1000) NOT NULL,
  title VARCHAR(500),
  keywords TEXT[],
  is_monitoring BOOLEAN DEFAULT true,
  monitoring_frequency VARCHAR(50) DEFAULT 'daily',
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  last_rank_drop_at TIMESTAMP WITH TIME ZONE,
  current_average_position DECIMAL(5,2),
  previous_average_position DECIMAL(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_site_id ON articles(site_id);
CREATE INDEX IF NOT EXISTS idx_articles_is_monitoring ON articles(is_monitoring) WHERE is_monitoring = true;
CREATE INDEX IF NOT EXISTS idx_articles_last_analyzed_at ON articles(last_analyzed_at);

-- 5. analysis_runs（分析実行履歴）テーブル
CREATE TABLE IF NOT EXISTS analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  trigger_type VARCHAR(50) NOT NULL, -- 'manual', 'scheduled', 'rank_drop'
  status VARCHAR(50) NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_article_id ON analysis_runs(article_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status) WHERE status IN ('pending', 'running');

-- 6. analysis_results（分析結果サマリー）テーブル
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  average_position DECIMAL(5,2),
  previous_average_position DECIMAL(5,2),
  position_change DECIMAL(5,2),
  analyzed_keywords TEXT[],
  dropped_keywords JSONB,
  top_keywords JSONB,
  recommended_additions JSONB,
  missing_content_summary TEXT,
  detailed_result_storage_key VARCHAR(500),
  detailed_result_expires_at TIMESTAMP WITH TIME ZONE,
  competitor_count INTEGER,
  analysis_duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_results_article_id ON analysis_results(article_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_analysis_run_id ON analysis_results(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_created_at ON analysis_results(created_at DESC);

-- 7. notifications（通知履歴）テーブル
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  notification_type VARCHAR(50) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  summary TEXT,
  detail_report_url VARCHAR(1000),
  detail_report_expires_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_article_id ON notifications(article_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at DESC);

-- 8. notification_settings（通知設定）テーブル
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  drop_threshold DECIMAL(5,2) DEFAULT 2.0,
  keyword_drop_threshold DECIMAL(5,2) DEFAULT 10.0,
  comparison_days INTEGER DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, article_id, notification_type, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_article_id ON notification_settings(article_id);

