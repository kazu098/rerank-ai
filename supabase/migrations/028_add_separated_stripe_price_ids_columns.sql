-- Stripe Price IDの環境分離: 別カラム方式
-- 既存のstripe_price_idsカラムを、stripe_price_ids_testとstripe_price_ids_liveの2つのカラムに分離
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- 新しいカラムを追加
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS stripe_price_ids_test JSONB,
ADD COLUMN IF NOT EXISTS stripe_price_ids_live JSONB;

-- 既存のstripe_price_idsをテスト環境のPrice IDとしてコピー
UPDATE plans 
SET stripe_price_ids_test = stripe_price_ids
WHERE stripe_price_ids IS NOT NULL;

-- コメントを追加
COMMENT ON COLUMN plans.stripe_price_ids_test IS 'テスト環境用のStripe Price ID（各通貨ごと）例: {"jpy": "price_test_xxx", "usd": "price_test_yyy"}';
COMMENT ON COLUMN plans.stripe_price_ids_live IS '本番環境用のStripe Price ID（各通貨ごと）例: {"jpy": "price_live_xxx", "usd": "price_live_yyy"}';

-- 既存のstripe_price_idsカラムを削除（オプション: データ移行後に実行）
-- 注意: データ移行を確認してから実行してください
-- ALTER TABLE plans DROP COLUMN stripe_price_ids;

