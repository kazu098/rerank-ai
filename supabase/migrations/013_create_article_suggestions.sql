-- 記事提案テーブルの作成
-- 新規記事提案機能で生成された記事タイトル案を保存・管理する

CREATE TABLE IF NOT EXISTS article_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  keywords JSONB NOT NULL,
  outline JSONB,
  reason TEXT,
  estimated_impressions INTEGER,
  priority INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_article_suggestions_user_site ON article_suggestions(user_id, site_id);
CREATE INDEX IF NOT EXISTS idx_article_suggestions_status ON article_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_article_suggestions_created_at ON article_suggestions(created_at DESC);

-- updated_atの自動更新トリガー
CREATE OR REPLACE FUNCTION update_article_suggestions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_article_suggestions_updated_at
  BEFORE UPDATE ON article_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_article_suggestions_updated_at();

