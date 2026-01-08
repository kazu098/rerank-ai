# 課金機能の検証方法

## 結論

**本番モードをオンにしなくても、Stripeのテストモードで完全に検証できます。**

## 検証方法

### 方法1: テストモードでの検証（推奨）⭐

#### メリット
- 実際の決済は発生しない（無料）
- 何度でもテスト可能
- 本番環境に影響しない

#### 必要な設定

1. **環境変数の設定**
   ```env
   # テストモードに設定
   STRIPE_MODE=test
   
   # または、STRIPE_SECRET_KEYがsk_test_で始まる場合は自動判定
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...  # テストモードのWebhook secret
   ```

2. **Stripe Dashboardでの設定**
   - Stripe Dashboardを**テストモード**に切り替え（右上のトグル）
   - テストモードでプラン（Price）を作成
   - テストモードでWebhookエンドポイントを設定

3. **テストカード番号**
   - **成功**: `4242 4242 4242 4242`
   - **3Dセキュリティ認証**: `4000 0025 0000 3155`
   - **支払い失敗**: `4000 0000 0000 0002`
   - **CVV**: 任意の3桁（例: `123`）
   - **有効期限**: 未来の日付（例: `12/34`）

#### 検証手順

1. **チェックアウトフローの検証**
   - アプリケーションでプランを選択
   - チェックアウト画面でテストカードを入力
   - 支払い完了画面に遷移することを確認

2. **Webhookの検証**

   **オプションA: Stripe CLIを使用（ローカル環境）**
   ```bash
   # Stripe CLIをインストール
   brew install stripe/stripe-cli/stripe
   
   # ログイン
   stripe login
   
   # Webhookをローカルに転送
   stripe listen --forward-to localhost:3000/api/billing/webhook
   
   # 別のターミナルでイベントをトリガー（オプション）
   stripe trigger checkout.session.completed
   ```

   **オプションB: 本番環境のWebhookエンドポイントを使用**
   - 本番環境のURL（例: `https://www.rerank-ai.com/api/billing/webhook`）をStripe Dashboardに登録
   - テストモードでも本番環境のWebhookエンドポイントを使用可能
   - テストモードのWebhook secretを環境変数に設定

3. **データベースの確認**
   - チェックアウト完了後、`users`テーブルでプランが更新されているか確認
   - `stripe_customer_id`と`stripe_subscription_id`が保存されているか確認

### 方法2: 本番モードでの検証（実際の決済）⭐重要

#### なぜ本番モードでの検証が必要か
- テストモードと本番モードでは環境が異なる可能性がある
- Webhookエンドポイントの設定が異なる
- 実際の決済処理フローの確認
- 本番環境での動作保証

#### 安全な検証手順

**ステップ1: 環境変数の準備**
```env
# 本番モードに設定
STRIPE_MODE=live

# 本番環境のキー
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...  # 本番モードのWebhook secret
```

**ステップ2: Stripe Dashboardでの設定**
1. Stripe Dashboardを**本番モード**に切り替え（右上のトグル）
2. 本番モードでプラン（Price）を作成・確認
3. 本番モードでWebhookエンドポイントを設定
   - URL: `https://www.rerank-ai.com/api/billing/webhook`
   - イベント: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

**ステップ3: 最小金額でテスト**
1. 最も安いプラン（例: Starterプラン）でテスト
2. 実際のカードで少額（可能な限り最小金額）をテスト
3. チェックアウト完了後、以下を確認：
   - ダッシュボードの課金ページでプランが更新されているか
   - Webhookが正しく発火しているか（Stripe DashboardのWebhookログを確認）
   - データベースの`users`テーブルでプランが更新されているか

**ステップ4: 即座に返金処理**
1. Stripe Dashboardで該当の支払いを確認
2. **Refund**をクリックして全額返金
3. 返金後、プランが正しく処理されるか確認（必要に応じて）

#### 注意点
- **実際の決済が発生する**ため、少額でテスト
- テスト後は**必ず返金処理を実行**
- テスト用のアカウントで実行することを推奨
- 本番環境の環境変数を更新する前に、バックアップを取る

#### 検証チェックリスト
- [ ] チェックアウトセッションが正常に作成される
- [ ] 支払いが正常に完了する
- [ ] Webhookが正しく発火する
- [ ] データベースのプランが更新される
- [ ] ダッシュボードの課金ページに正しく表示される
- [ ] 返金処理が正常に動作する（テスト後）

## 推奨される検証フロー

### 開発・検証フェーズ
1. **テストモードで検証**（方法1）
   - チェックアウトフロー
   - Webhook処理
   - プラン更新
   - プラン変更
   - キャンセル

### 本番リリース前
2. **本番モードで最終確認**（方法2、オプション）
   - 実際の決済フローを1回だけテスト
   - すぐに返金処理を実行

## テストモードと本番モードの違い

| 項目 | テストモード | 本番モード |
|------|------------|----------|
| 決済 | 発生しない | 発生する |
| カード番号 | テストカード使用 | 実際のカード使用 |
| Webhook | テスト用エンドポイント | 本番用エンドポイント |
| データ | テストデータ | 実際の顧客データ |
| コスト | 無料 | 手数料が発生 |

## まとめ

**テストモードで十分に検証できます。** 本番モードをオンにする必要はありません。

ただし、Webhookの検証については：
- **ローカル環境**: Stripe CLIを使用
- **本番環境**: 本番環境のWebhookエンドポイントをStripe Dashboardに登録（テストモードでも使用可能）

