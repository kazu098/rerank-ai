-- ユーザーのロケール設定を追加
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- usersテーブルにlocaleカラムを追加
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'ja';

-- インデックスを追加（必要に応じて）
CREATE INDEX IF NOT EXISTS idx_users_locale ON users(locale);

-- 既存ユーザーのlocaleを'ja'に設定（既にデフォルト値が設定されるが、明示的に設定）
UPDATE users
SET locale = 'ja'
WHERE locale IS NULL;

