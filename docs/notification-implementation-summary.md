# 通知機能の実装状況まとめ

## ✅ 実装完了項目

### 1. データベーススキーマ
- ✅ `articles`テーブルに通知関連カラムを追加
  - `is_fixed`, `fixed_at`, `fixed_notification_id`
  - `last_notification_sent_at`, `notification_count_last_7_days`
- ✅ `notifications`テーブルに通知キーと優先度を追加
  - `notification_key`, `priority`, `is_fixed`
- ✅ `notification_settings`テーブルに通知判定用カラムを追加
  - `consecutive_drop_days`, `min_impressions`, `notification_cooldown_days`
  - `notification_time`, `timezone`
- ✅ `users`テーブルにタイムゾーンを追加
  - `timezone`

### 2. 通知判定ロジック
- ✅ `NotificationChecker`クラスを実装
  - 閾値をハードコードせず、設定から取得
  - 修正済みフラグの確認
  - 通知頻度制限のチェック（過去7日間で1回まで）
  - 連続下落日数のチェック（3日間連続）
  - インプレッション数の閾値チェック（100以上）
- ✅ 多言語対応（メッセージキー形式）

### 3. 通知設定管理
- ✅ `getNotificationSettings()`: 通知設定を取得
- ✅ `saveOrUpdateNotificationSettings()`: 通知設定を保存・更新
- ✅ デフォルト値の定義

### 4. まとめ通知機能
- ✅ `sendBulkNotification()`: 複数の記事を1つのメールにまとめて送信
- ✅ `formatBulkEmailBody()`: まとめ通知のメール本文を生成
- ✅ 多言語対応（ja/en）

### 5. Cronジョブ
- ✅ `/api/cron/check-rank`: 順位下落をチェックして通知を送信
  - 実行頻度: 1日1回（UTC 0時）
  - 監視対象の記事を取得
  - 各記事に対して通知判定を実行
  - 通知が必要な記事をユーザーごとにまとめる
  - まとめ通知を送信
  - 通知履歴をDBに保存

### 6. タイムゾーン対応
- ✅ タイムゾーンユーティリティ関数（`lib/timezone-utils.ts`）
- ✅ ユーザーのタイムゾーン更新API（`/api/users/update-timezone`）
- ✅ フロントエンドでタイムゾーンを自動検出して保存

### 7. 通知設定UI
- ✅ 分析結果画面に通知設定UIを追加
- ✅ モーダルで通知設定を入力可能
  - メール通知（チェックボックス）
  - 通知時刻（時間選択）
- ✅ 監視開始API（`/api/articles/start-monitoring`）
- ✅ 多言語対応

## ⚠️ 残りの実装項目

### 1. ユーザーのロケール設定
- ⚠️ Cronジョブでユーザーのロケールを取得（現在は'ja'固定）
- 実装方法:
  - `users`テーブルに`locale`カラムを追加
  - または、フロントエンドのロケール設定をDBに保存

### 2. GSCトークンのリフレッシュ
- ⚠️ トークンが期限切れの場合の自動リフレッシュ機能
- 現在: 期限切れの場合はスキップ
- 実装方法:
  - `lib/gsc-api.ts`の`refreshAccessToken()`メソッドを実装
  - Cronジョブでトークンが期限切れの場合にリフレッシュ

### 3. 修正済みフラグのUI
- ⚠️ ユーザーが記事を「修正済み」とマークするUI
- 実装方法:
  - ダッシュボードまたは通知メールに「修正済み」ボタンを追加
  - `/api/articles/mark-as-fixed`エンドポイントを作成

### 4. 通知履歴の表示
- ⚠️ ユーザーが過去の通知を確認できるUI
- 実装方法:
  - ダッシュボードページを作成
  - 通知履歴を一覧表示

### 5. エラーハンドリングの強化
- ⚠️ Cronジョブのエラー通知
- ⚠️ 通知送信失敗時のリトライ機能

### 6. テスト
- ⚠️ 通知判定ロジックのユニットテスト
- ⚠️ Cronジョブの統合テスト

## 📝 実装済みファイル一覧

### データベース
- `supabase/migrations/002_notification_system.sql`
- `supabase/migrations/003_timezone_support.sql`

### バックエンド
- `lib/db/notification-settings.ts` - 通知設定の管理
- `lib/db/articles.ts` - 記事の通知関連カラム対応
- `lib/db/users.ts` - ユーザーのタイムゾーン対応
- `lib/notification-checker.ts` - 通知判定ロジック
- `lib/notification.ts` - まとめ通知機能
- `lib/timezone-utils.ts` - タイムゾーンユーティリティ

### API
- `app/api/cron/check-rank/route.ts` - Cronジョブ
- `app/api/articles/start-monitoring/route.ts` - 監視開始API
- `app/api/users/update-timezone/route.ts` - タイムゾーン更新API

### フロントエンド
- `app/[locale]/page.tsx` - 通知設定UI追加

### 設定
- `vercel.json` - Cron設定追加

### メッセージ
- `messages/ja.json` - 通知関連メッセージ追加
- `messages/en.json` - 通知関連メッセージ追加

## 🎯 MVPとして動作する機能

現在の実装で、以下の機能が動作します：

1. ✅ 分析結果画面で通知設定を登録
2. ✅ 1日1回、Cronジョブで順位下落をチェック
3. ✅ 順位下落が検知された場合、まとめ通知を送信
4. ✅ 通知頻度制限（1記事あたり過去7日間で1回まで）
5. ✅ 連続下落日数のチェック（3日間連続）
6. ✅ インプレッション数の閾値チェック（100以上）

## 🔄 今後の改善項目（Phase 2）

1. ユーザーのロケール設定をDBに保存
2. GSCトークンの自動リフレッシュ
3. 修正済みフラグのUI
4. 通知履歴の表示
5. エラーハンドリングの強化
6. テストの追加

