-- RLS（Row Level Security）の有効化と関数のセキュリティ設定
-- Supabase Database Linterのエラーと警告に対応

-- ============================================
-- 1. 関数のsearch_path設定（セキュリティ警告対応）
-- ============================================

-- update_article_suggestions_updated_at関数のsearch_pathを設定
CREATE OR REPLACE FUNCTION update_article_suggestions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- update_slack_integrations_updated_at関数のsearch_pathを設定
CREATE OR REPLACE FUNCTION update_slack_integrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- update_user_alert_settings_updated_at関数のsearch_pathを設定
CREATE OR REPLACE FUNCTION update_user_alert_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================
-- 2. RLSの有効化（セキュリティエラー対応）
-- ============================================

-- plansテーブル: 読み取り専用で全員アクセス可能（プラン情報は公開）
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_all" ON plans
  FOR SELECT
  USING (true);

-- usersテーブル: 自分のデータのみアクセス可能
-- 注: ユーザー登録はサービスロールで行う必要があるため、INSERTポリシーは設定しない
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- sitesテーブル: 自分のデータのみアクセス可能
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sites_select_own" ON sites
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sites_insert_own" ON sites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sites_update_own" ON sites
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "sites_delete_own" ON sites
  FOR DELETE
  USING (auth.uid() = user_id);

-- articlesテーブル: 自分のデータのみアクセス可能
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "articles_select_own" ON articles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "articles_insert_own" ON articles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "articles_update_own" ON articles
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "articles_delete_own" ON articles
  FOR DELETE
  USING (auth.uid() = user_id);

-- analysis_runsテーブル: 自分の記事のデータのみアクセス可能
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_runs_select_own" ON analysis_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = analysis_runs.article_id
      AND articles.user_id = auth.uid()
    )
  );

CREATE POLICY "analysis_runs_insert_own" ON analysis_runs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = analysis_runs.article_id
      AND articles.user_id = auth.uid()
    )
  );

-- analysis_resultsテーブル: 自分の記事のデータのみアクセス可能
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_results_select_own" ON analysis_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = analysis_results.article_id
      AND articles.user_id = auth.uid()
    )
  );

CREATE POLICY "analysis_results_insert_own" ON analysis_results
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = analysis_results.article_id
      AND articles.user_id = auth.uid()
    )
  );

-- notificationsテーブル: 自分のデータのみアクセス可能
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert_own" ON notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- notification_settingsテーブル: 自分のデータのみアクセス可能
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_settings_select_own" ON notification_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notification_settings_insert_own" ON notification_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_settings_update_own" ON notification_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "notification_settings_delete_own" ON notification_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- user_alert_settingsテーブル: 自分のデータのみアクセス可能
ALTER TABLE user_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_alert_settings_select_own" ON user_alert_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_alert_settings_insert_own" ON user_alert_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_alert_settings_update_own" ON user_alert_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- article_suggestionsテーブル: 自分のデータのみアクセス可能
ALTER TABLE article_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "article_suggestions_select_own" ON article_suggestions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "article_suggestions_insert_own" ON article_suggestions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "article_suggestions_update_own" ON article_suggestions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "article_suggestions_delete_own" ON article_suggestions
  FOR DELETE
  USING (auth.uid() = user_id);

-- slack_integrationsテーブル: 自分のデータのみアクセス可能
ALTER TABLE slack_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_integrations_select_own" ON slack_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "slack_integrations_insert_own" ON slack_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "slack_integrations_update_own" ON slack_integrations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "slack_integrations_delete_own" ON slack_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- login_attemptsテーブル: サービスロールのみアクセス可能
-- 通常のユーザーはアクセスできないようにする
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_attempts_service_role_only" ON login_attempts
  FOR ALL
  USING (false);

-- rate_limitsテーブル: サービスロールのみアクセス可能
-- 通常のユーザーはアクセスできないようにする
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_service_role_only" ON rate_limits
  FOR ALL
  USING (false);
