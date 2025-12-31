# Stripe課金機能の検証ガイド

## 1. Stripe側での設定

### 必要な設定

#### 1.1 Stripeアカウントの準備
1. [Stripe Dashboard](https://dashboard.stripe.com/)にログイン
2. **テストモード**と**本番モード**を切り替え可能（右上のトグル）

#### 1.2 プラン（Price）の作成
Stripe Dashboardで以下のプランを作成する必要があります：

1. **Products** → **Add product** をクリック
2. 各プラン（starter, standard, business）を作成
3. **Recurring** を選択し、**Monthly** を設定
4. 各通貨（USD, JPY, EUR, GBP）ごとにPriceを作成
5. **Price ID** をコピー（例: `price_xxxxx`）

#### 1.3 データベースへのPrice ID登録
作成したPrice IDをデータベースの`plans`テーブルに登録：

```sql
-- 例: starterプランのJPY価格IDを登録
UPDATE plans 
SET stripe_price_ids = jsonb_set(
  COALESCE(stripe_price_ids, '{}'::jsonb),
  '{JPY}',
  '"price_xxxxx"'::jsonb
)
WHERE name = 'starter';
```

#### 1.4 Webhookエンドポイントの設定
1. **Developers** → **Webhooks** → **Add endpoint**
2. エンドポイントURL: `https://your-domain.com/api/billing/webhook`
3. イベントを選択：
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. **Signing secret** をコピーして環境変数に設定

#### 1.5 環境変数の設定
```env
# テストモード
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# 本番モード
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 2. 検証方法

### 2.1 テストモードでの検証

#### テストカード番号
- **成功**: `4242 4242 4242 4242`
- **3Dセキュリティ認証**: `4000 0025 0000 3155`
- **支払い失敗**: `4000 0000 0000 0002`
- **CVV**: 任意の3桁（例: `123`）
- **有効期限**: 未来の日付（例: `12/34`）
- **郵便番号**: 任意（例: `12345`）

#### 検証手順
1. アプリケーションでプランを選択
2. チェックアウト画面でテストカードを入力
3. 支払い完了後、Webhookが発火することを確認
4. ダッシュボードの課金ページでプランが更新されていることを確認

### 2.2 Webhookのローカル検証（Stripe CLI）

#### Stripe CLIのインストール
```bash
# macOS
brew install stripe/stripe-cli/stripe

# ログイン
stripe login
```

#### Webhookの転送
```bash
# ローカルサーバーでWebhookを受信
stripe listen --forward-to localhost:3000/api/billing/webhook

# 別のターミナルでイベントをトリガー
stripe trigger checkout.session.completed
```

### 2.3 本番環境での検証
1. Stripe Dashboardを**本番モード**に切り替え
2. 実際のカードで少額（例: 100円）をテスト
3. すぐに返金処理を実行

## 3. Stripeサブスクリプションの動作

### 3.1 月額引き落としのタイミング

**Stripeのデフォルト動作**:
- 初回支払い: チェックアウト完了時（即座）
- 2回目以降: 初回支払い日から1ヶ月後（例: 1月15日 → 2月15日）
- 以降も同様に1ヶ月ごとに自動引き落とし

**現在の実装**:
- `subscription.created`: サブスクリプション作成時にプランを更新
- `invoice.payment_succeeded`: 毎月の支払い成功時にプラン期間を更新

### 3.2 プラン変更時の動作

#### 現在の実装状況
⚠️ **注意**: 現在、プラン変更の直接APIは実装されていません。Customer Portal経由でのみ変更可能です。

#### Customer Portal経由でのプラン変更
1. ユーザーが「プランを管理」ボタンをクリック
2. Stripe Customer Portalに遷移
3. プランを変更
4. Stripeが`subscription.updated`イベントを発火
5. Webhookでプランを更新

**Stripeのデフォルト動作**:
- **即座に変更**: プラン変更時に即座に新しいプランが適用され、差額が請求/返金される
- **期間終了時に変更**: 現在の期間終了時に新しいプランが適用される（設定可能）

#### 推奨: プラン変更APIの実装
以下のようなAPIを実装することを推奨します：

```typescript
// app/api/billing/subscription/change/route.ts
export async function POST(request: NextRequest) {
  // 1. 現在のサブスクリプションを取得
  // 2. 新しいプランのPrice IDを取得
  // 3. subscription.update()でプランを変更
  // 4. proration_behavior: 'always' または 'none' を設定
}
```

### 3.3 フリープランに戻る場合

**現在の実装**:
- ユーザーがCustomer Portalでサブスクリプションをキャンセル
- Stripeが`subscription.deleted`イベントを発火
- Webhookで無料プランに変更
- **現在の期間終了日まで有料プランが継続**（`plan_ends_at`まで）

**コード**:
```typescript
// app/api/billing/webhook/route.ts (line 185-212)
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // 無料プランに変更
  const freePlan = await getPlanByName("free");
  const planEndsAt = new Date(subscriptionData.current_period_end * 1000);
  await updateUserPlan(userId, freePlan.id, new Date(), planEndsAt);
}
```

**動作**:
- 例: 1月15日にキャンセル → 2月15日まで有料プランが有効
- 2月15日以降は自動的に無料プランに切り替わる

## 4. 実装すべき改善点

### 4.1 プラン変更APIの実装
現在、プラン変更はCustomer Portal経由のみです。直接APIを実装することを推奨します。

### 4.2 プラン変更のタイミング設定
- **即座に変更**: `proration_behavior: 'always'`（差額を請求/返金）
- **期間終了時に変更**: `proration_behavior: 'none'`（差額なし）

### 4.3 支払い失敗時の処理
現在はログのみ出力しています。以下の処理を追加することを推奨：
- ユーザーへの通知（メール/Slack）
- リトライ設定
- 一定回数失敗後の自動キャンセル

## 5. トラブルシューティング

### Webhookが届かない
1. WebhookエンドポイントのURLが正しいか確認
2. Webhook secretが正しく設定されているか確認
3. Stripe DashboardのWebhookログを確認
4. ローカル環境ではStripe CLIを使用

### プランが更新されない
1. Webhookのイベントが正しく設定されているか確認
2. データベースの`plans`テーブルにPrice IDが登録されているか確認
3. Webhookのログを確認

### 請求書が生成されない
1. サブスクリプションが正しく作成されているか確認
2. `invoice.payment_succeeded`イベントが発火しているか確認
3. Stripe Dashboardで請求書を確認

