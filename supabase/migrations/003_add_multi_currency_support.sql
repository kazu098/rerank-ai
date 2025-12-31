-- 多通貨対応のためのカラムを追加
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- plansテーブルに多通貨対応のカラムを追加
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS base_price_usd INTEGER, -- USD基準の価格（セント単位、例: 2000 = $20.00）
ADD COLUMN IF NOT EXISTS stripe_price_ids JSONB, -- 各通貨ごとのStripe Price ID
ADD COLUMN IF NOT EXISTS exchange_rates JSONB; -- 固定為替レート

-- 既存のprice_monthlyをbase_price_usdに変換（円ベースの価格をUSDに変換）
-- 現在の価格（円）をUSDに変換: 2980円 ÷ 150 = 19.87 USD ≈ 2000セント
UPDATE plans SET 
  base_currency = 'USD',
  base_price_usd = CASE 
    WHEN name = 'free' THEN 0
    WHEN name = 'starter' THEN 2000  -- $20.00 (2980円 ÷ 150 ≈ $19.87)
    WHEN name = 'standard' THEN 6500  -- $65.00 (9800円 ÷ 150 ≈ $65.33)
    WHEN name = 'business' THEN 19900  -- $199.00 (29800円 ÷ 150 ≈ $198.67)
    ELSE 0
  END,
  exchange_rates = '{"jpy": 150.00, "eur": 0.85, "gbp": 0.80}'::jsonb
WHERE base_price_usd IS NULL;

-- コメントを追加
COMMENT ON COLUMN plans.base_currency IS '基準通貨（デフォルト: USD）';
COMMENT ON COLUMN plans.base_price_usd IS 'USD基準の価格（セント単位）';
COMMENT ON COLUMN plans.stripe_price_ids IS '各通貨ごとのStripe Price ID (例: {"usd": "price_xxx", "jpy": "price_yyy"})';
COMMENT ON COLUMN plans.exchange_rates IS '固定為替レート (例: {"jpy": 150.00, "eur": 0.85})';

