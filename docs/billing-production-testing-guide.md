# 本番環境での課金検証ガイド

## なぜ本番環境での検証が必要か

テストモードで検証済みでも、本番環境では以下が異なる可能性があります：
- Webhookエンドポイントの設定
- 実際の決済処理フロー
- 環境変数の設定
- ネットワークやセキュリティ設定

## 安全な検証手順

### ステップ1: 環境変数の準備

#### Vercelでの設定

1. **Vercel Dashboard** → プロジェクト → **Settings** → **Environment Variables**
2. **Production**環境を選択
3. 以下の環境変数を設定：

```env
# Stripe本番モード
STRIPE_MODE=live
STRIPE_LIVE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

#### 注意点
- 環境変数を更新した後、**必ずRedeploy**を実行
- 本番環境の環境変数を変更する前に、現在の設定をバックアップ

### ステップ2: Stripe Dashboardでの設定

1. **Stripe Dashboard**を**本番モード**に切り替え（右上のトグル）
2. **Products** → 本番モードでプラン（Price）を作成・確認
3. **Developers** → **Webhooks** → **Add endpoint**
   - URL: `https://www.rerank-ai.com/api/billing/webhook`
   - イベントを選択：
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - **Signing secret**をコピーして環境変数に設定

### ステップ3: 最小金額でテスト

1. **最も安いプラン**（例: Starterプラン）でテスト
2. **実際のカード**で少額（可能な限り最小金額）をテスト
3. チェックアウト完了後、以下を確認：
   - ✅ ダッシュボードの課金ページでプランが更新されているか
   - ✅ Webhookが正しく発火しているか（Stripe DashboardのWebhookログを確認）
   - ✅ データベースの`users`テーブルでプランが更新されているか
   - ✅ `stripe_customer_id`と`stripe_subscription_id`が保存されているか

### ステップ4: 即座に返金処理

1. **Stripe Dashboard** → **Payments** → 該当の支払いを選択
2. **Refund**をクリックして**全額返金**
3. 返金後、以下を確認：
   - ✅ 返金が正常に処理されたか
   - ✅ 必要に応じて、プランが正しく処理されるか

## 検証チェックリスト

### チェックアウトフロー
- [ ] チェックアウトセッションが正常に作成される
- [ ] 支払いが正常に完了する
- [ ] 成功ページに正しくリダイレクトされる

### Webhook処理
- [ ] `checkout.session.completed`が発火する
- [ ] `customer.subscription.created`が発火する
- [ ] Webhookの処理が正常に完了する（Stripe Dashboardのログで確認）

### データベース更新
- [ ] `users`テーブルの`plan_id`が更新される
- [ ] `users`テーブルの`stripe_customer_id`が保存される
- [ ] `users`テーブルの`stripe_subscription_id`が保存される
- [ ] `users`テーブルの`plan_starts_at`と`plan_ends_at`が正しく設定される

### UI表示
- [ ] ダッシュボードの課金ページにプランが正しく表示される
- [ ] プラン制限が正しく適用される

### 返金処理
- [ ] 返金が正常に処理される
- [ ] 返金後、必要に応じてプランが正しく処理される

## トラブルシューティング

### Webhookが届かない
1. **Stripe Dashboard** → **Developers** → **Webhooks** → 該当エンドポイントを選択
2. **Recent events**でイベントが発火しているか確認
3. **Response**でエラーメッセージを確認
4. 本番環境のログを確認（Vercel Dashboard → **Deployments** → **Functions** → **Logs**）

### プランが更新されない
1. Webhookのログを確認（Stripe Dashboard）
2. データベースの`plans`テーブルにPrice IDが正しく登録されているか確認
3. 本番環境のログを確認

### 環境変数が反映されない
1. 環境変数を更新した後、**必ずRedeploy**を実行
2. Vercel Dashboardで環境変数が正しく設定されているか確認
3. デプロイメントログで環境変数が読み込まれているか確認

## 検証後の対応

### 検証が成功した場合
1. 返金処理を実行
2. 環境変数を本番モードのまま維持
3. 本番環境での動作を継続監視

### 検証で問題が発生した場合
1. すぐに`STRIPE_MODE=test`に戻す
2. 問題を修正
3. テストモードで再検証
4. 修正後、再度本番モードで検証

## まとめ

**本番環境での検証は重要です。** 以下の手順で安全に検証できます：

1. ✅ 最小金額でテスト
2. ✅ 即座に返金処理
3. ✅ すべてのチェックリストを確認
4. ✅ 問題が発生した場合はすぐにテストモードに戻す

