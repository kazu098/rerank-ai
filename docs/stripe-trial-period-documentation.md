# Stripe無料トライアル期間の公式ドキュメント

## 公式ドキュメントURL

### 1. Checkout Session作成時の`subscription_data.trial_period_days`

**公式ドキュメント**: https://stripe.com/docs/api/checkout/sessions/create

**該当セクション**: `subscription_data.trial_period_days`

**説明**:
- Checkout Session作成時に`subscription_data.trial_period_days`を設定することで、サブスクリプションにトライアル期間を設定できます
- この設定により、Stripeが自動的にトライアル期間を管理し、期間終了後に自動的に課金を開始します

### 2. サブスクリプション作成時の`trial_period_days`

**公式ドキュメント**: https://stripe.com/docs/api/subscriptions/create

**該当セクション**: `trial_period_days`

**説明**:
- サブスクリプション作成時に`trial_period_days`を設定することで、トライアル期間を設定できます
- Checkout Sessionの`subscription_data.trial_period_days`と同じ動作をします

### 3. トライアル期間の詳細説明

**公式ドキュメント**: https://stripe.com/docs/billing/subscriptions/trials

**説明**:
- トライアル期間の設定方法
- トライアル期間中の動作
- トライアル終了後の自動課金の仕組み

## 実装の確認

### 現在の実装

```typescript
// app/api/billing/checkout/route.ts
if (trial === true && planName === "starter") {
  checkoutSessionParams.subscription_data = {
    ...checkoutSessionParams.subscription_data,
    trial_period_days: 7, // 7日間の無料トライアル
  };
}
```

### 公式ドキュメントの説明

Stripeの公式ドキュメントによると：

> **`trial_period_days`** (integer, optional)
> 
> Integer representing the number of trial period days before the customer is charged for the first time. This will always overwrite any trials that might apply via a subscribed plan.
> 
> **自動的な動作**:
> - トライアル期間中は、顧客に課金されません
> - トライアル期間終了後、Stripeが自動的に最初の請求を試行します
> - 請求が成功すると、サブスクリプションが`active`状態になります
> - 請求が失敗すると、サブスクリプションが`past_due`または`unpaid`状態になります

## 動作の確認

### 1. サブスクリプションの状態

トライアル期間中：
- `subscription.status`: `trialing`
- `subscription.trial_end`: トライアル終了日時（Unix timestamp）
- `subscription.current_period_end`: トライアル終了日時と同じ

トライアル終了後：
- `subscription.status`: `active`（請求成功時）または`past_due`（請求失敗時）
- `subscription.trial_end`: `null`
- `subscription.current_period_end`: 次の請求日時

### 2. Webhookイベント

トライアル期間中：
- `checkout.session.completed`
- `customer.subscription.created`（`status: trialing`）

トライアル終了時：
- `customer.subscription.updated`（`status: active`）
- `invoice.payment_succeeded`（請求成功時）
- `invoice.payment_failed`（請求失敗時）

## まとめ

**✅ はい、`trial_period_days: 7`を設定することで、Stripeが自動的にトライアル期間を管理し、7日後に自動的に課金を開始します。**

公式ドキュメントで明確に説明されており、追加の実装は不要です。

**参考URL**:
- https://stripe.com/docs/api/checkout/sessions/create
- https://stripe.com/docs/api/subscriptions/create
- https://stripe.com/docs/billing/subscriptions/trials

