# Slack連携のデータベース設計について

## 現状の問題

現在、`notification_settings`テーブルにSlack関連のカラム（`slack_bot_token`, `slack_user_id`, `slack_team_id`, `slack_channel_id`, `slack_notification_type`）を持たせていますが、これは以下の理由で冗長です：

1. **1ユーザー1チャネル**: 現段階では、1ユーザーにつき1つのSlackチャネル（またはDM）のみをサポート
2. **データの重複**: 記事ごとの通知設定（`article_id`が設定されたレコード）にも、同じSlack情報をコピーしている
3. **正規化の欠如**: Slack連携情報はユーザー単位の情報であり、通知設定とは別の概念

## 設計の選択肢

### 案1: 現状維持（記事ごとに異なるチャネル対応を前提）

**メリット:**
- 将来、記事ごとに異なるチャネルに投稿したい場合に対応可能
- 既存の実装を大きく変更する必要がない

**デメリット:**
- データの重複（1ユーザー1チャネルなのに、各記事の設定に同じ情報を保存）
- 正規化されていない
- チャネル変更時に全記事の設定を更新する必要がある

### 案2: 正規化（slack_integrationsテーブルを作成）

**メリット:**
- データの正規化（1ユーザー1チャネルの情報を1箇所に保存）
- チャネル変更時に1箇所だけ更新すれば良い
- 将来の拡張性（複数チャネル対応時は`slack_integration_id`を追加）

**デメリット:**
- リファクタリングが必要（既存のコードとマイグレーション）
- 記事ごとに異なるチャネルが必要になった場合、再度設計変更が必要

**実装例:**
```sql
-- slack_integrationsテーブルを作成
CREATE TABLE slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slack_bot_token TEXT NOT NULL,
  slack_user_id VARCHAR(50),
  slack_team_id VARCHAR(50) NOT NULL,
  slack_channel_id VARCHAR(50),
  slack_notification_type VARCHAR(20) DEFAULT 'channel',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- notification_settingsからSlack関連カラムを削除
-- 代わりに、slack_integration_idを追加（将来の拡張用）
ALTER TABLE notification_settings
  ADD COLUMN slack_integration_id UUID REFERENCES slack_integrations(id);
```

### 案3: usersテーブルに追加

**メリット:**
- 最もシンプル（新しいテーブルが不要）
- 1ユーザー1チャネルという前提に合致

**デメリット:**
- usersテーブルが肥大化
- 将来、複数チャネル対応時に再度設計変更が必要

## 推奨案

**現段階（MVP）**: **案2（正規化）**を推奨します。

**理由:**
1. **将来の拡張性**: 記事ごとに異なるチャネルが必要になった場合、`notification_settings`に`slack_integration_id`を追加するだけで対応可能
2. **データの整合性**: チャネル変更時に1箇所だけ更新すれば良い
3. **コードの保守性**: Slack連携情報の取得が明確になる

**将来の拡張（記事ごとに異なるチャネル）:**
```sql
-- notification_settingsにslack_integration_idを追加
ALTER TABLE notification_settings
  ADD COLUMN slack_integration_id UUID REFERENCES slack_integrations(id);

-- 記事ごとに異なるチャネルを設定可能に
-- slack_integration_idがNULLの場合は、ユーザーのデフォルトチャネルを使用
```

## 移行計画

1. **Phase 1**: `slack_integrations`テーブルを作成
2. **Phase 2**: 既存の`notification_settings`からSlack情報を`slack_integrations`に移行
3. **Phase 3**: `notification_settings`からSlack関連カラムを削除（または非推奨化）
4. **Phase 4**: コードを更新して`slack_integrations`テーブルを使用

## 結論

現段階では動作確認を優先し、設計の改善は**次のイテレーション**で実施することを推奨します。ただし、将来的には正規化（案2）を検討すべきです。


