-- 競合URL一覧をanalysis_resultsテーブルに追加
-- 通知メールに競合URL一覧が必要なため、DBに保存する

ALTER TABLE analysis_results
ADD COLUMN IF NOT EXISTS competitor_urls JSONB;

-- インデックスを追加（JSONBクエリのパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_analysis_results_competitor_urls ON analysis_results USING GIN (competitor_urls);

