# Supabaseセットアップガイド

## 1. 環境変数の設定

`.env.local`に以下の環境変数を設定してください：

```env
NEXT_PUBLIC_SUPABASE_URL=https://rsxragpqumwgymidjmyt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_pDTft4w50lCRYUwuCDs0Iw_DMfP_N-i
SUPABASE_SERVICE_ROLE_KEY=sb_secret_mDc53xCAjvomZhT0eqiWFA_w9GRcP28
```

✅ 完了済み

## 2. データベーススキーマの作成

Supabaseダッシュボードでマイグレーションを実行します。

### 手順

1. [Supabaseダッシュボード](https://supabase.com/dashboard)にログイン
2. プロジェクトを選択
3. 左メニューから「SQL Editor」をクリック
4. 「New query」をクリック
5. `supabase/migrations/001_initial_schema.sql`の内容をコピー＆ペースト
6. 「Run」ボタンをクリックして実行

### 実行するSQL

`supabase/migrations/001_initial_schema.sql`の内容をそのまま実行してください。

### 確認

実行後、左メニューの「Table Editor」で以下のテーブルが作成されていることを確認してください：

- ✅ plans
- ✅ users
- ✅ sites
- ✅ articles
- ✅ analysis_runs
- ✅ analysis_results
- ✅ notifications
- ✅ notification_settings

また、「plans」テーブルに4つのプラン（free, starter, standard, business）が登録されていることを確認してください。

## 3. 動作確認

マイグレーション実行後、以下のコマンドで開発サーバーを起動して動作確認してください：

```bash
npm run dev
```

ログイン時にユーザー情報がデータベースに保存されることを確認してください。

