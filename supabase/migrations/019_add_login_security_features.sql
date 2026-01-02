-- ログインセキュリティ機能の追加
-- ログイン試行回数制限とアカウントロック機能

-- 1. usersテーブルにアカウントロック関連のカラムを追加
ALTER TABLE users
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP WITH TIME ZONE;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- 2. login_attemptsテーブルを作成（ログイン試行履歴）
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45), -- IPv6対応
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason VARCHAR(100), -- 'invalid_password', 'account_locked', 'email_not_verified', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスを追加（クエリパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created_at ON login_attempts(email, created_at DESC);

-- 3. rate_limitsテーブルを作成（レート制限用）
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL, -- email または ip_address
  action_type VARCHAR(50) NOT NULL, -- 'login', 'register', 'password_reset', etc.
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(identifier, action_type, window_start)
);

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_action ON rate_limits(identifier, action_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- コメントを追加
COMMENT ON COLUMN users.locked_until IS 'アカウントロックの解除時刻（NULLの場合はロックされていない）';
COMMENT ON COLUMN users.failed_login_attempts IS '連続ログイン失敗回数';
COMMENT ON COLUMN users.last_failed_login_at IS '最後のログイン失敗時刻';
COMMENT ON TABLE login_attempts IS 'ログイン試行履歴（監査ログ用）';
COMMENT ON TABLE rate_limits IS 'レート制限記録（IPアドレスまたはメールアドレス単位）';

