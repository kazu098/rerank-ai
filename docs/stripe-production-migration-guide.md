# Stripe本番環境移行ガイド

## 概要

Stripeを本番環境に移行する際に必要な環境変数の設定と実装上の変更点をまとめました。

## 1. 必要な環境変数

### 1.1 Stripe関連の環境変数（必須）

本番環境では、以下の環境変数を**本番モード**の値に変更する必要があります。

```env
# Stripe本番モード（Stripe Dashboard → API keys → Reveal live key）
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**取得方法**:
1. [Stripe Dashboard](https://dashboard.stripe.com/)にログイン
2. 右上のトグルを**「Live mode」**に切り替え
3. **Developers** → **API keys** → **Reveal live key**をクリック
4. Secret keyとPublishable keyをコピー
5. **Developers** → **Webhooks** → 本番環境のWebhookエンドポイントを選択 → **Signing secret**をコピー

### 1.2 その他の環境変数（必須）

```env
# NextAuth.js（本番環境のURLを設定）
NEXTAUTH_URL=https://your-domain.com
AUTH_SECRET=your-secret-key-here  # または NEXTAUTH_SECRET

# ベースURL（Stripe CheckoutのリダイレクトURLで使用）
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### 1.3 環境変数の完全なリスト

```env
# ============================================
# Stripe（本番環境）
# ============================================
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ============================================
# NextAuth.js
# ============================================
NEXTAUTH_URL=https://your-domain.com
AUTH_SECRET=your-secret-key-here

# ============================================
# ベースURL
# ============================================
NEXT_PUBLIC_BASE_URL=https://your-domain.com

# ============================================
# その他の環境変数（既存の設定を維持）
# ============================================
# Google OAuth 2.0
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# その他のAPIキーなど...
```

## 2. Stripe Dashboardでの設定

### 2.1 Webhookエンドポイントの設定（必須）

1. Stripe Dashboardにログイン
2. 右上のトグルを**「Live mode」**に切り替え（重要）
3. 左サイドバーから **「開発者」** → **「Webhook」** をクリック（または、ワークベンチ → Webhook）
4. **「+ 送信先を追加する」** ボタンをクリック
5. エンドポイントURLを入力: `https://your-domain.com/api/billing/webhook`
6. イベントを選択（すべて選択）:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
7. **「追加」** または **「Add endpoint」** をクリック
8. 作成されたWebhookエンドポイントを選択
9. **「Signing secret」**（署名シークレット）セクションで **「Reveal」**（表示）をクリック
10. 表示されたSecretをコピー（`whsec_...`形式）して環境変数`STRIPE_LIVE_WEBHOOK_SECRET`に設定

**重要**: 
- テストモードと本番モード（Live mode）で異なるWebhookエンドポイントとSigning secretが必要です
- 本番環境のWebhookエンドポイントを作成する場合は、必ず右上のトグルが**「Live mode」**になっていることを確認してください

### 2.2 プラン（Price）の作成（必須）

本番環境でも、各プラン（starter、standard、business）のPrice IDを作成する必要があります。

1. **Products** → **Add product**をクリック
2. 各プランを作成:
   - Starter（月額2,980円）
   - Standard（月額9,800円）
   - Business（月額29,800円）
3. **Recurring**を選択し、**Monthly**を設定
4. 各通貨（JPY、USD、EUR、GBPなど）ごとにPriceを作成
5. **Price ID**をコピー（例: `price_xxxxx`）

### 2.3 データベースへのPrice ID登録（必須）

本番環境のPrice IDをデータベースに登録します。

```sql
-- StarterプランのJPY価格IDを登録
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{JPY}',
  '"price_本番環境のPrice_ID"'::jsonb
)
WHERE name = 'starter';

-- StandardプランのJPY価格IDを登録
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{JPY}',
  '"price_本番環境のPrice_ID"'::jsonb
)
WHERE name = 'standard';

-- BusinessプランのJPY価格IDを登録
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{JPY}',
  '"price_本番環境のPrice_ID"'::jsonb
)
WHERE name = 'business';
```

**他の通貨（USD、EUR、GBP）も同様に登録**してください。

### 2.4 Customer Portalの設定（推奨）

ユーザーがプランを変更・解約できるように、Customer Portalを設定します。

1. **Settings** → **Billing** → **Customer portal**
2. 必要に応じて設定をカスタマイズ
3. **Save changes**をクリック

## 3. 実装上の変更点

### 3.1 環境変数の設定場所

#### Vercelの場合

1. [Vercel Dashboard](https://vercel.com/dashboard)にログイン
2. プロジェクトを選択
3. **Settings** → **Environment Variables**
4. 各環境変数を追加/更新:
   - `STRIPE_SECRET_KEY`（本番環境用の値を設定）
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（本番環境用の値を設定）
   - `STRIPE_WEBHOOK_SECRET`（本番環境用の値を設定）
   - `NEXTAUTH_URL`（本番環境のURLを設定）
   - `NEXT_PUBLIC_BASE_URL`（本番環境のURLを設定）
5. **Save**をクリック
6. **Deployments** → 最新のデプロイメントを選択 → **Redeploy**をクリック

#### その他の環境

環境変数を`.env.production`ファイルに設定するか、実行環境の環境変数設定機能を使用してください。

### 3.2 コード変更の確認

現在の実装では、環境変数から値を取得しているため、**コード変更は不要**です。

確認ポイント:
- `lib/stripe/client.ts`: `process.env.STRIPE_SECRET_KEY`と`process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`を使用
- `app/api/billing/webhook/route.ts`: `process.env.STRIPE_WEBHOOK_SECRET`を使用
- `app/api/billing/checkout/route.ts`: `process.env.NEXT_PUBLIC_BASE_URL`を使用

## 4. 検証手順

### 4.1 環境変数の確認

```bash
# Vercel CLIを使用する場合
vercel env ls

# または、アプリケーション内で確認（開発環境のみ推奨）
console.log(process.env.STRIPE_SECRET_KEY?.substring(0, 7)); // "sk_live"と表示されることを確認
```

### 4.2 Webhookの動作確認

1. Stripe Dashboard → **Developers** → **Webhooks**
2. 本番環境のWebhookエンドポイントを選択
3. **Send test webhook**をクリック
4. イベントを選択（例: `checkout.session.completed`）
5. アプリケーションのログでWebhookが正常に受信されたことを確認

### 4.3 決済フローの検証

1. 本番環境のアプリケーションにアクセス
2. プランを選択してチェックアウト
3. 実際のカード（またはStripeのテストカード）で支払い
4. プランが正常に更新されることを確認
5. Stripe Dashboard → **Payments**で決済が記録されていることを確認

**注意**: 本番環境でのテストは、少額（例: 100円）で行い、テスト後は即座に返金処理を実行してください。

## 5. トラブルシューティング

### 5.1 Webhookが受信されない

- **WebhookエンドポイントのURLが正しいか確認**: `https://your-domain.com/api/billing/webhook`
- **WebhookのSigning secretが正しいか確認**: 環境変数`STRIPE_WEBHOOK_SECRET`の値
- **Stripe DashboardでWebhookイベントが発火しているか確認**: **Developers** → **Webhooks** → イベントログ

### 5.2 決済が失敗する

- **Stripe APIキーが正しいか確認**: 本番モードのキーを使用しているか
- **Price IDが正しいか確認**: データベースに登録されているPrice IDが本番環境のものか
- **Stripe Dashboardでエラーを確認**: **Developers** → **Logs**

### 5.3 プランが更新されない

- **Webhookが正常に動作しているか確認**: 上記の「Webhookの動作確認」を参照
- **アプリケーションのログを確認**: Webhookの処理でエラーが発生していないか
- **データベースの接続を確認**: Supabaseの接続設定

## 6. セキュリティチェックリスト

本番環境移行時に確認すべき項目:

- ✅ Stripe APIキーが本番環境のものに設定されている
- ✅ WebhookのSigning secretが本番環境のものに設定されている
- ✅ WebhookエンドポイントがHTTPSで保護されている
- ✅ 環境変数が適切に管理されている（機密情報が公開されていない）
- ✅ エラーログが適切に監視されている
- ✅ 決済処理のログが記録されている

## 7. 関連ドキュメント

- [Stripe Dashboard](https://dashboard.stripe.com/)
- [Stripe API リファレンス](https://stripe.com/docs/api)
- [Stripe Webhook ガイド](https://stripe.com/docs/webhooks)
- [env.production.template](../env.production.template)

