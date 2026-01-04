-- 本番環境（Live mode）のStripe Price IDを登録
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行
--
-- 注意: このマイグレーションを実行する前に、028_add_separated_stripe_price_ids_columns.sql を実行してください

-- Starterプランの本番環境Price ID
UPDATE plans 
SET stripe_price_ids_live = '{
  "jpy": "price_1SleZu1uG4Z4AnhYwOZlD5PO",
  "usd": "price_1SleaI1uG4Z4AnhYWMuPWmBs"
}'::jsonb
WHERE name = 'starter';

-- Standardプランの本番環境Price ID
UPDATE plans 
SET stripe_price_ids_live = '{
  "jpy": "price_1SleZn1uG4Z4AnhYcfqoeo4H",
  "usd": "price_1SleaB1uG4Z4AnhYMnSO60B7"
}'::jsonb
WHERE name = 'standard';

-- Businessプランの本番環境Price ID
UPDATE plans 
SET stripe_price_ids_live = '{
  "jpy": "price_1SleZf1uG4Z4AnhYCD6AYoIt",
  "usd": "price_1Slea31uG4Z4AnhY8AG0uIzg"
}'::jsonb
WHERE name = 'business';

-- 確認用クエリ（実行後の確認用）
-- SELECT name, stripe_price_ids_live FROM plans WHERE name IN ('starter', 'standard', 'business');

