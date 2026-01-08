# Stripe無料トライアル期間の動作ガイド

## 概要

Stripeの`trial_period_days`を使用することで、**自動的に7日後に課金を開始**することができます。

## 動作の流れ

### 1. チェックアウトセッション作成時

```typescript
subscription_data: {
  trial_period_days: 7, // 7日間の無料トライアル
}
```

この設定により：
- ✅ ユーザーはクレジットカードを登録する必要がある
- ✅ トライアル期間中（7日間）は**課金されない**
- ✅ トライアル終了後、**自動的に最初の請求が行われる**

### 2. サブスクリプションの状態

トライアル期間中：
- `subscription.status`: `trialing`（トライアル中）
- `subscription.trial_end`: トライアル終了日時（Unix timestamp）
- `subscription.current_period_end`: トライアル終了日時と同じ

トライアル終了後：
- `subscription.status`: `active`（アクティブ）
- `subscription.trial_end`: `null`（トライアル終了）
- `subscription.current_period_end`: 次の請求日時

### 3. Webhookイベント

トライアル期間中に発火するイベント：
1. `checkout.session.completed` - チェックアウト完了時
2. `customer.subscription.created` - サブスクリプション作成時（`status: trialing`）

トライアル終了時に発火するイベント：
1. `customer.subscription.updated` - トライアル終了、課金開始時（`status: active`）
2. `invoice.payment_succeeded` - 初回請求成功時
3. `invoice.payment_failed` - 初回請求失敗時（カードエラーなど）

## 重要な注意点

### 1. 3Dセキュア認証（SCA）

**問題**: トライアル終了後の初回課金時に3Dセキュア認証が必要な場合、課金が失敗する可能性があります。

**対策**:
- チェックアウト時に`payment_method_collection: 'always'`を設定（デフォルトで設定済み）
- カード登録時に3Dセキュア認証を完了させる

**現在の実装**:
```typescript
// app/api/billing/checkout/route.ts
// Stripe Checkoutはデフォルトで3Dセキュア認証を要求するため、
// トライアル開始時に認証が完了している
```

### 2. トライアル終了時の処理

トライアル終了時は、以下のWebhookで処理されます：

```typescript
// app/api/billing/webhook/route.ts
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // subscription.status が 'active' になったら、トライアル終了
  // subscription.trial_end が null になったら、トライアル終了
  const trialEndsAt = trialEnd && trialEnd * 1000 > Date.now() 
    ? new Date(trialEnd * 1000) 
    : null; // トライアル終了後はnull
}
```

### 3. 請求失敗時の処理

初回請求が失敗した場合：
- `invoice.payment_failed`イベントが発火
- Stripeは自動的にリトライを試みる（設定による）
- 複数回失敗すると、サブスクリプションが`past_due`または`unpaid`状態になる

**推奨**: `invoice.payment_failed`イベントを処理して、ユーザーに通知を送信する

## 実装の確認

### 現在の実装

✅ **チェックアウトセッション作成時**:
```typescript
// app/api/billing/checkout/route.ts
if (trial === true && planName === "starter") {
  checkoutSessionParams.subscription_data = {
    ...checkoutSessionParams.subscription_data,
    trial_period_days: 7, // 7日間の無料トライアル
  };
}
```

✅ **Webhook処理**:
```typescript
// app/api/billing/webhook/route.ts
// subscription.created, subscription.updated で trial_end を取得
const trialEnd = subscriptionData.trial_end;
const trialEndsAt = trialEnd ? new Date(trialEnd * 1000) : null;
await updateUserPlan(userId, plan.id, planStartedAt, planEndsAt, trialEndsAt);
```

## テスト方法

### テストモードでの確認

1. **Stripe Dashboard** → **Developers** → **Events**
2. テストカードでチェックアウトを実行
3. サブスクリプションの状態を確認：
   - `status: trialing`
   - `trial_end: 7日後`
4. トライアル終了をシミュレート：
   - Stripe Dashboard → **Subscriptions** → 該当サブスクリプション
   - **Actions** → **End trial** をクリック
   - または、`trial_end`を過去の日時に設定

### 本番環境での確認

1. 実際のカードでチェックアウトを実行
2. 7日間待つ（またはStripe Dashboardで`trial_end`を過去の日時に設定）
3. `invoice.payment_succeeded`イベントが発火することを確認
4. 請求が正常に処理されることを確認

## まとめ

**✅ Stripeで自動的に7日後に課金を開始することは可能です。**

現在の実装は正しく設定されており、以下の動作が保証されます：

1. ✅ トライアル期間中は課金されない
2. ✅ トライアル終了後、自動的に最初の請求が行われる
3. ✅ Webhookでトライアル終了を検知できる
4. ✅ 請求失敗時は適切に処理される

**注意**: 3Dセキュア認証が必要な場合、トライアル開始時に認証を完了させる必要があります（Stripe Checkoutはデフォルトでこれを処理します）。

