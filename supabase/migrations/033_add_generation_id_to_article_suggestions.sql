-- article_suggestionsテーブルにgeneration_idカラムを追加
-- 1回の生成セッション（新規記事作成ボタンを押した回数）をグループ化するため

-- generation_idカラムを追加（既存レコードはNULLになる）
ALTER TABLE article_suggestions 
ADD COLUMN generation_id UUID;

-- 既存レコードに対して、created_atを基準にgeneration_idを生成
-- 同じ秒に作成されたレコードを同じgeneration_idにグループ化
-- まず、ユニークなグループごとにgeneration_idを生成
WITH generation_groups AS (
  SELECT 
    user_id,
    site_id,
    DATE_TRUNC('second', created_at) as generation_time,
    gen_random_uuid() as gen_id
  FROM article_suggestions
  GROUP BY user_id, site_id, DATE_TRUNC('second', created_at)
)
UPDATE article_suggestions
SET generation_id = generation_groups.gen_id
FROM generation_groups
WHERE article_suggestions.user_id = generation_groups.user_id
  AND article_suggestions.site_id = generation_groups.site_id
  AND DATE_TRUNC('second', article_suggestions.created_at) = generation_groups.generation_time;

-- generation_idをNOT NULLに変更（新規レコードには必ず設定される）
ALTER TABLE article_suggestions 
ALTER COLUMN generation_id SET NOT NULL;

-- インデックスの作成（カウントクエリのパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_article_suggestions_generation_id ON article_suggestions(generation_id);
CREATE INDEX IF NOT EXISTS idx_article_suggestions_user_generation ON article_suggestions(user_id, generation_id);
