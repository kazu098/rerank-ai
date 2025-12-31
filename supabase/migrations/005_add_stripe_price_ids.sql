-- Stripe Price IDをデータベースに登録
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- Starterプラン
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{jpy}',
  '"price_1SkLBf0ZbA9gLDd9vgwZp55h"'::jsonb
)
WHERE name = 'starter';

UPDATE plans 
SET stripe_price_ids = jsonb_set(
  stripe_price_ids,
  '{usd}',
  '"price_1SkLEr0ZbA9gLDd95Id64ZpA"'::jsonb
)
WHERE name = 'starter';

-- Standardプラン
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{jpy}',
  '"price_1SkLDT0ZbA9gLDd9cD003OPQ"'::jsonb
)
WHERE name = 'standard';

UPDATE plans 
SET stripe_price_ids = jsonb_set(
  stripe_price_ids,
  '{usd}',
  '"price_1SkLFY0ZbA9gLDd9Mgplrsj9"'::jsonb
)
WHERE name = 'standard';

-- Businessプラン
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{jpy}',
  '"price_1SkLEK0ZbA9gLDd96hg6lkBU"'::jsonb
)
WHERE name = 'business';

UPDATE plans 
SET stripe_price_ids = jsonb_set(
  stripe_price_ids,
  '{usd}',
  '"price_1SkLG30ZbA9gLDd9YmnNdw5W"'::jsonb
)
WHERE name = 'business';

-- 確認用クエリ（実行後の確認用）
-- SELECT name, stripe_price_ids FROM plans WHERE name IN ('starter', 'standard', 'business');

