-- sitesテーブルにauth_error_atカラムを追加
-- 認証エラーが発生した時刻を記録し、24時間以内の重複通知を防ぐため

ALTER TABLE sites
ADD COLUMN IF NOT EXISTS auth_error_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_sites_auth_error_at ON sites(auth_error_at) WHERE auth_error_at IS NOT NULL;

COMMENT ON COLUMN sites.auth_error_at IS '認証エラーが発生した時刻（24時間以内の重複通知を防ぐため）';

