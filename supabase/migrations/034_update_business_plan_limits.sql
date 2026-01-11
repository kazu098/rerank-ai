-- ビジネスプランの制限を更新（無制限から800回/300記事に変更）
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- ビジネスプランの制限を更新
UPDATE plans 
SET 
  max_articles = 300,
  max_analyses_per_month = 800
WHERE name = 'business';

-- 更新確認
-- SELECT name, max_articles, max_analyses_per_month, max_sites FROM plans WHERE name = 'business';
