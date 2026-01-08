-- Freeプランの新規記事提案回数を0から1に変更（累計）
-- 分析回数と同様に、Freeプランでは累計で1回体験できるようにする

UPDATE plans 
SET max_article_suggestions_per_month = 1
WHERE name = 'free';
