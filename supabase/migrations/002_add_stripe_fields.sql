-- Stripe連携用のカラムを追加
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- usersテーブルにStripe関連のカラムを追加
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255) UNIQUE;

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);

-- plansテーブルに追加フィールドを追加
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS max_article_suggestions_per_month INTEGER,
ADD COLUMN IF NOT EXISTS analysis_history_days INTEGER;

-- プランの初期データを更新
UPDATE plans SET 
  max_article_suggestions_per_month = 1,
  analysis_history_days = 30
WHERE name = 'starter';

UPDATE plans SET 
  max_article_suggestions_per_month = 3,
  analysis_history_days = 90
WHERE name = 'standard';

UPDATE plans SET 
  max_article_suggestions_per_month = 10,
  analysis_history_days = NULL
WHERE name = 'business';

UPDATE plans SET 
  max_article_suggestions_per_month = 1,
  analysis_history_days = NULL
WHERE name = 'free';

-- コメントを追加
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe Customer ID';
COMMENT ON COLUMN users.stripe_subscription_id IS 'Stripe Subscription ID';
COMMENT ON COLUMN plans.max_article_suggestions_per_month IS '月間新規記事提案回数（NULLは無制限）';
COMMENT ON COLUMN plans.analysis_history_days IS '分析履歴保存期間（日数、NULLは無制限）';

