-- Freeプランの累計分析回数を3回から7回に変更
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

UPDATE plans 
SET max_analyses_per_month = 7
WHERE name = 'free';

-- コメントを追加
COMMENT ON COLUMN plans.max_analyses_per_month IS '月間分析回数（Freeプランの場合は累計として扱う）';
