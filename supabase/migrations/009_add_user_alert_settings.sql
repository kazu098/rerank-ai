-- ユーザーアラート設定テーブル
CREATE TABLE IF NOT EXISTS user_alert_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  position_drop_threshold DECIMAL(3,1) DEFAULT 2.0 NOT NULL,  -- 平均順位の下落幅
  keyword_drop_threshold INTEGER DEFAULT 10 NOT NULL,          -- 特定キーワードの転落条件（順位）
  comparison_days INTEGER DEFAULT 7 NOT NULL,                   -- 過去何日間の平均順位
  notification_frequency VARCHAR(20) DEFAULT 'daily' NOT NULL, -- 通知頻度: 'daily', 'weekly', 'none'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_user_alert_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_alert_settings_updated_at
  BEFORE UPDATE ON user_alert_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_alert_settings_updated_at();

-- インデックス（既にPRIMARY KEYでインデックスが作成されるため、追加のインデックスは不要）

