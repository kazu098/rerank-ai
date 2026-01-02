# Stripe環境切り替えガイド

## 概要

テスト環境と本番環境を簡単に切り替えられるように、環境変数の設定方法を改善しました。

## 環境変数の設定方法

### 方法1: モード指定方式（推奨）

`STRIPE_MODE`環境変数でモードを指定し、テスト用と本番用のキーを分けて設定します。

```env
# Stripeモード（test または live）
STRIPE_MODE=test  # または live

# テストモード用のキー
STRIPE_TEST_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_...

# 本番モード用のキー
STRIPE_LIVE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

**使い方**:
- `STRIPE_MODE=test` を設定すると、`STRIPE_TEST_*` のキーを使用
- `STRIPE_MODE=live` を設定すると、`STRIPE_LIVE_*` のキーを使用

### 方法2: 後方互換性方式（既存の設定でも動作）

既存の環境変数名（`STRIPE_SECRET_KEY`など）でも動作します。この場合、キーのプレフィックス（`sk_test_` または `sk_live_`）から自動的にモードを判定します。

```env
# 従来通りの設定（モードはキーのプレフィックスから自動判定）
STRIPE_SECRET_KEY=sk_test_...  # または sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # または pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 方法3: ハイブリッド方式

`STRIPE_MODE`を設定し、片方のキーのみを設定することも可能です（もう一方は従来の環境変数名を使用）。

```env
STRIPE_MODE=test
STRIPE_TEST_SECRET_KEY=sk_test_...
# STRIPE_SECRET_KEY=sk_test_... も使用可能（フォールバック）

STRIPE_MODE=live
STRIPE_LIVE_SECRET_KEY=sk_live_...
# STRIPE_SECRET_KEY=sk_live_... も使用可能（フォールバック）
```

## 環境変数の優先順位

### Secret Key

1. `STRIPE_MODE=live` の場合:
   - `STRIPE_LIVE_SECRET_KEY`（最優先）
   - `STRIPE_SECRET_KEY`（フォールバック）

2. `STRIPE_MODE=test` の場合（または未設定）:
   - `STRIPE_TEST_SECRET_KEY`（最優先）
   - `STRIPE_SECRET_KEY`（フォールバック）

### Publishable Key

1. `STRIPE_MODE=live` の場合:
   - `NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY`（最優先）
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（フォールバック）

2. `STRIPE_MODE=test` の場合（または未設定）:
   - `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY`（最優先）
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（フォールバック）

### Webhook Secret

1. `STRIPE_MODE=live` の場合:
   - `STRIPE_LIVE_WEBHOOK_SECRET`（最優先）
   - `STRIPE_WEBHOOK_SECRET`（フォールバック）

2. `STRIPE_MODE=test` の場合（または未設定）:
   - `STRIPE_TEST_WEBHOOK_SECRET`（最優先）
   - `STRIPE_WEBHOOK_SECRET`（フォールバック）

## 実装例

### Vercelでの設定

#### 開発環境（Preview環境など）

1. Vercel Dashboard → プロジェクト → **Settings** → **Environment Variables**
2. 環境を選択: **Preview** または **Development**
3. 以下の環境変数を追加:

```env
STRIPE_MODE=test
STRIPE_TEST_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_...
```

#### 本番環境（Production環境）

1. 環境を選択: **Production**
2. 以下の環境変数を追加:

```env
STRIPE_MODE=live
STRIPE_LIVE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

### ローカル開発環境

`.env.local`ファイルを作成:

```env
# .env.local（開発用）
STRIPE_MODE=test
STRIPE_TEST_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_...
```

本番環境でテストする場合（一時的に）:

```env
# .env.local（本番環境でテスト用）
STRIPE_MODE=live
STRIPE_LIVE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

## 環境切り替えの手順

### 1. テスト環境から本番環境に切り替え

```bash
# 環境変数を変更
export STRIPE_MODE=live

# または .env.local を編集
STRIPE_MODE=live
```

### 2. 本番環境からテスト環境に切り替え

```bash
# 環境変数を変更
export STRIPE_MODE=test

# または .env.local を編集
STRIPE_MODE=test
```

### 3. Vercelでの環境変数変更

1. Vercel Dashboard → プロジェクト → **Settings** → **Environment Variables**
2. `STRIPE_MODE`を編集
3. 最新のデプロイメントを**Redeploy**

## 動作確認

### 現在のモードを確認

アプリケーションのログで確認:

```typescript
// 開発環境でのみ確認（本番環境では機密情報をログに出力しない）
console.log('Stripe Mode:', process.env.STRIPE_MODE || 'auto-detected');
```

### 使用中のキーを確認

```typescript
// 開発環境でのみ（プレフィックスのみ表示）
const secretKey = process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
console.log('Using key:', secretKey?.substring(0, 7)); // "sk_test" または "sk_live"
```

## エラーハンドリング

環境変数が正しく設定されていない場合、以下のエラーが発生します:

- `STRIPE_LIVE_SECRET_KEY or STRIPE_SECRET_KEY is not set for live mode`
- `STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY is not set for test mode`
- `STRIPE_LIVE_SECRET_KEY must start with sk_live_`
- `STRIPE_TEST_SECRET_KEY must start with sk_test_`

## ベストプラクティス

### 1. 環境ごとに分離

- **開発環境**: `STRIPE_MODE=test` + テスト用キー
- **本番環境**: `STRIPE_MODE=live` + 本番用キー

### 2. キーの検証

実装では、キーのプレフィックスを検証しています:
- テストキーは `sk_test_` または `pk_test_` で始まる必要がある
- 本番キーは `sk_live_` または `pk_live_` で始まる必要がある

### 3. 環境変数の管理

- **Vercel**: Environment Variables機能を使用（環境ごとに設定可能）
- **ローカル開発**: `.env.local`ファイルを使用（Gitにコミットしない）
- **機密情報**: 環境変数に保存（コードに直接記述しない）

## Stripe CLIでのWebhook Secret取得

### ローカル開発用のWebhook Secret（テストモード）

Stripe CLIを使用すると、ローカル開発用のWebhook Secretを取得できます：

```bash
# Stripe CLIをインストール（macOS）
brew install stripe/stripe-cli/stripe

# Stripe CLIにログイン
stripe login

# 方法1: Webhook Secretだけを表示（推奨）
stripe listen --print-secret

# 方法2: Webhookを転送しながらSecretを表示
stripe listen --forward-to localhost:3000/api/billing/webhook
```

**方法1（`--print-secret`）**の場合、ターミナルに以下のような出力が表示されます：

```
whsec_xxxxxxxxxxxxx
```

**方法2（`--forward-to`）**の場合、ターミナルに以下のような出力が表示されます：

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
```

この`whsec_xxxxxxxxxxxxx`がローカル開発用のWebhook Secretです。`.env.local`に設定してください：

```env
STRIPE_MODE=test
STRIPE_TEST_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

**注意**: `stripe listen --print-secret`で取得できるWebhook Secretは、テストモード用の一時的なSecretです。本番環境のWebhook Secretとは異なります。

### 本番環境のWebhook Secret

**重要**: **本番環境（Live mode）のWebhook Secretは、Stripe CLIでは取得できません**。

Stripe CLIのログイン画面で選択できる「Test mode」や「Sandbox」は、Stripe CLIがアクセスする環境を選択するためのもので、以下のような違いがあります：

- **Test mode**: テスト環境のアカウントにアクセス（`stripe listen`でテスト用の一時的なWebhook Secretを取得可能）
- **Sandbox**: サンドボックス環境にアクセス（テスト環境の一種）
- **本番環境（Live mode）**: Stripe CLIでは直接アクセスできません

**本番環境のWebhook Secretは、Stripe Dashboardから取得する必要があります**：

1. [Stripe Dashboard](https://dashboard.stripe.com/)にログイン
2. 右上のトグルを**「Live mode」**に切り替え
3. 左サイドバーから **「開発者」** → **「Webhook」** をクリック（または、ワークベンチ → Webhook）
4. 既存のWebhookエンドポイントを選択、または **「+ 送信先を追加する」** ボタンをクリックして新規作成
5. Webhookエンドポイントの詳細画面で、**「Signing secret」**（署名シークレット）セクションを探す
6. **「Reveal」**（表示）または **「表示」** ボタンをクリック
7. 表示されたSecretをコピー（`whsec_...`形式）

**注意**: 
- テストモードと本番モード（Live mode）では、異なるWebhookエンドポイントとSigning Secretが必要です
- 本番環境のWebhookエンドポイントを作成する場合は、右上のトグルが**「Live mode」**になっていることを確認してください

**補足**: `stripe listen --live`コマンドは、本番環境のイベントをローカルでリッスンするためのもので、本番環境のWebhook Secretを取得するものではありません。このコマンドで取得できるWebhook Secretも、ローカル開発用の一時的なものです。

### Webhookエンドポイントの情報を確認

**注意**: Stripe CLIには、Webhookエンドポイントの一覧を表示するコマンドは存在しません。Webhookエンドポイントの情報（URL、イベント、Signing Secretなど）は、Stripe Dashboardから確認・取得する必要があります。

## トラブルシューティング

### Q: モードが正しく切り替わらない

A: 環境変数`STRIPE_MODE`が正しく設定されているか確認してください。また、デプロイ後に環境変数が反映されているか確認してください（Vercelの場合は再デプロイが必要な場合があります）。

### Q: 既存の環境変数（STRIPE_SECRET_KEY）が動作しない

A: 従来の環境変数名もサポートされています。キーのプレフィックス（`sk_test_` または `sk_live_`）から自動的にモードが判定されます。`STRIPE_MODE`が設定されている場合は、それが優先されます。

### Q: テスト環境で本番キーが使われてしまう

A: `STRIPE_MODE=test`を明示的に設定してください。また、`STRIPE_TEST_*`の環境変数を設定することで、誤って本番キーを使用することを防げます。

## 関連ドキュメント

- [Stripe本番環境移行ガイド](./stripe-production-migration-guide.md)
- [env.production.template](../env.production.template)

