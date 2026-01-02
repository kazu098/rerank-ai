# Stripe Webhookイベント選択ガイド

## 必要なイベント

このサービスで必要なStripe Webhookイベントは以下の6つです：

1. `checkout.session.completed` - チェックアウトセッション完了時
2. `customer.subscription.created` - サブスクリプション作成時
3. `customer.subscription.updated` - サブスクリプション更新時（プラン変更など）
4. `customer.subscription.deleted` - サブスクリプション削除時（解約）
5. `invoice.payment_succeeded` - 請求書の支払い成功時（毎月の自動引き落とし）
6. `invoice.payment_failed` - 請求書の支払い失敗時

## 選択方法

### 方法1: 検索で個別に選択（推奨）

1. 検索バーにイベント名を入力して検索
2. 見つかったイベントにチェックを入れる
3. 6つのイベントすべてを選択するまで繰り返す

### 方法2: カテゴリから選択

- **Checkout**: `checkout.session.completed`
- **Customer Subscription**: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- **Invoice**: `invoice.payment_succeeded`, `invoice.payment_failed`

リストから該当するカテゴリを展開して、上記のイベントを選択してください。

### 方法3: すべてのイベントを選択（非推奨）

「すべて選択します」チェックボックスを使用することもできますが、不要なイベントも送信されるため、サーバーのリソースを無駄に消費します。必要なイベントのみを選択することを推奨します。

## イベントの説明

| イベント名 | 説明 | 用途 |
|-----------|------|------|
| `checkout.session.completed` | ユーザーがチェックアウトを完了した時 | 初回プラン登録時の処理 |
| `customer.subscription.created` | サブスクリプションが作成された時 | プランの開始日を設定 |
| `customer.subscription.updated` | サブスクリプションが更新された時 | プラン変更時の処理 |
| `customer.subscription.deleted` | サブスクリプションが削除された時 | 解約時の処理（無料プランに戻す） |
| `invoice.payment_succeeded` | 請求書の支払いが成功した時 | 毎月の自動引き落とし成功時 |
| `invoice.payment_failed` | 請求書の支払いが失敗した時 | 支払い失敗時の通知（ログ出力） |

## 次のステップ

イベントを選択したら、「続行 →」ボタンをクリックして、次のステップ（送信先の設定）に進んでください。

