-- 固定為替レートによる価格計算をやめ、各通貨ごとに直接価格を設定する方式に変更
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- plansテーブルにpricesカラムを追加（各通貨ごとの価格を直接保存）
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS prices JSONB; -- 各通貨ごとの価格（例: {"USD": 2000, "JPY": 2980, "EUR": 1700, "GBP": 1600}）

-- 既存の価格データをpricesに移行
-- JPY: 円単位、USD/EUR/GBP: セント単位
UPDATE plans SET 
  prices = CASE 
    WHEN name = 'free' THEN '{"USD": 0, "JPY": 0, "EUR": 0, "GBP": 0}'::jsonb
    WHEN name = 'starter' THEN '{"USD": 2000, "JPY": 2980, "EUR": 1700, "GBP": 1600}'::jsonb
    WHEN name = 'standard' THEN '{"USD": 6500, "JPY": 9800, "EUR": 5600, "GBP": 5300}'::jsonb
    WHEN name = 'business' THEN '{"USD": 19900, "JPY": 29800, "EUR": 17000, "GBP": 16000}'::jsonb
    ELSE '{"USD": 0, "JPY": 0, "EUR": 0, "GBP": 0}'::jsonb
  END
WHERE prices IS NULL;

-- コメントを追加
COMMENT ON COLUMN plans.prices IS '各通貨ごとの価格（JPYは円単位、USD/EUR/GBPはセント単位）';

