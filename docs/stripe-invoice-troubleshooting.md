# Stripe請求書が表示されない問題のトラブルシューティング

## 問題

本番環境で課金しても請求書が表示されない（テストモードでは表示される）

## 原因と解決方法

### 1. Stripe Dashboardの請求書設定

**確認場所**: Stripe Dashboard → **Settings** → **Billing** → **Invoices**

#### 確認項目

1. **請求書の自動生成**
   - 「Automatically finalize invoices」が有効になっているか確認
   - 有効になっていない場合、請求書が`draft`状態のままになる可能性があります

2. **請求書の自動送信**
   - 「Send finalized invoices to customers」が有効になっているか確認
   - 有効になっていない場合、請求書が生成されても顧客に送信されません

3. **請求書のテンプレート**
   - 請求書のテンプレートが設定されているか確認
   - テンプレートが設定されていない場合、`hosted_invoice_url`や`invoice_pdf`が生成されない可能性があります

### 2. 請求書のステータス

Stripeの請求書には以下のステータスがあります：

- `draft`: ドラフト状態（確定されていない）
- `open`: 確定済み（支払い待ち）
- `paid`: 支払い済み
- `void`: 無効化された
- `uncollectible`: 回収不能

**問題**: `draft`状態の請求書は`hosted_invoice_url`や`invoice_pdf`が生成されません。

**解決方法**: 
- Stripe Dashboardで請求書を手動で確定する
- または、請求書の自動確定設定を有効にする

### 3. コード側の確認

現在の実装では、すべてのステータスの請求書を取得しています。必要に応じて、特定のステータスのみを取得するようにフィルタリングできます：

```typescript
const invoices = await stripe.invoices.list({
  customer: user.stripe_customer_id,
  limit: 12,
  status: 'paid', // 支払い済みの請求書のみ取得
});
```

### 4. デバッグ方法

1. **APIログを確認**
   - `/api/billing/invoices`のログで、取得した請求書の情報を確認
   - `status`、`hosted_invoice_url`、`invoice_pdf`の値を確認

2. **Stripe Dashboardで確認**
   - **Customers** → 該当の顧客を選択
   - **Invoices**タブで請求書の一覧を確認
   - 各請求書のステータスと`hosted_invoice_url`の有無を確認

3. **Stripe APIで直接確認**
   ```bash
   curl https://api.stripe.com/v1/invoices?customer=cus_xxx \
     -u sk_live_xxx:
   ```

### 5. 推奨設定

#### Stripe Dashboardの設定

1. **Settings** → **Billing** → **Invoices**
   - ✅ 「Automatically finalize invoices」を有効化
   - ✅ 「Send finalized invoices to customers」を有効化
   - ✅ 請求書のテンプレートを設定

2. **Settings** → **Billing** → **Customer portal**
   - ✅ 「Invoice history」を有効化（顧客が請求書を確認できるように）

### 6. コード側の改善案

請求書が表示されない場合のフォールバック処理：

```typescript
// 請求書が確定されていない場合、手動で確定を試みる
if (invoice.status === 'draft') {
  try {
    await stripe.invoices.finalizeInvoice(invoice.id);
    // 再取得
    const finalizedInvoice = await stripe.invoices.retrieve(invoice.id);
    // finalizedInvoiceを使用
  } catch (error) {
    console.error('Failed to finalize invoice:', error);
  }
}
```

## まとめ

本番環境で請求書が表示されない主な原因：

1. ✅ **Stripe Dashboardの設定**: 請求書の自動確定・自動送信が無効
2. ✅ **請求書のステータス**: `draft`状態のまま確定されていない
3. ✅ **請求書のテンプレート**: テンプレートが設定されていない

**解決方法**: Stripe Dashboardで上記の設定を確認し、必要に応じて有効化してください。

