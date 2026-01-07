-- pending_plan_idカラムを追加
-- ダウングレード時に「次回適用されるプラン」を管理するため

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_plan_id UUID REFERENCES plans(id);

CREATE INDEX IF NOT EXISTS idx_users_pending_plan_id ON users(pending_plan_id) WHERE pending_plan_id IS NOT NULL;

