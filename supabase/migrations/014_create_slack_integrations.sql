-- Slack連携情報を正規化するためのテーブル作成
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- slack_integrationsテーブルを作成
CREATE TABLE IF NOT EXISTS slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slack_bot_token TEXT NOT NULL,
  slack_user_id VARCHAR(50), -- Slack User ID (Uで始まる)
  slack_team_id VARCHAR(50) NOT NULL, -- Slack Team ID (Tで始まる)
  slack_channel_id VARCHAR(50), -- チャンネルIDまたはUser ID (DM送信の場合)
  slack_notification_type VARCHAR(20) DEFAULT 'channel', -- 'channel' or 'dm'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの追加
CREATE INDEX IF NOT EXISTS idx_slack_integrations_user_id ON slack_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_integrations_slack_team_id ON slack_integrations(slack_team_id);

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_slack_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_slack_integrations_updated_at
  BEFORE UPDATE ON slack_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_slack_integrations_updated_at();

