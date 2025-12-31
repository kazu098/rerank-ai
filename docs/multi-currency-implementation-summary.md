# 多通貨対応実装サマリー

## 実装内容

### 1. 固定為替レートの採用

**方針**: USD基準で価格を管理し、固定為替レートで各通貨に変換

**固定為替レート**:
- 1 USD = 150 JPY
- 1 USD = 0.85 EUR
- 1 USD = 0.80 GBP

**メリット**:
- 為替変動による価格の不安定さを回避
- 顧客が予測可能な価格で利用可能
- 四半期ごとなど定期的に見直し可能

### 2. DBスキーマの拡張

**マイグレーション**: `003_add_multi_currency_support.sql`

追加されたカラム:
- `base_currency`: 基準通貨（デフォルト: USD）
- `base_price_usd`: USD基準の価格（セント単位）
- `stripe_price_ids`: 各通貨ごとのStripe Price ID（JSONB）
- `exchange_rates`: 固定為替レート（JSONB）

### 3. 実装ファイル

**新規作成**:
- `lib/billing/currency.ts`: 通貨変換とフォーマット機能
- `supabase/migrations/003_add_multi_currency_support.sql`: 多通貨対応のマイグレーション
- `docs/multi-currency-pricing.md`: 設計ドキュメント

**更新**:
- `lib/db/plans.ts`: 多通貨対応の関数を追加
- `app/api/billing/checkout/route.ts`: 通貨自動判定機能を追加
- `app/[locale]/pricing/page.tsx`: 通貨選択UIを追加

### 4. Stripeの設定方法

**各通貨ごとにPrice IDを作成**:

1. **Stripe Dashboard**で各プランごとに複数のPrice IDを作成
   - USD: `price_starter_usd_monthly` ($20.00)
   - JPY: `price_starter_jpy_monthly` (¥3,000)
   - EUR: `price_starter_eur_monthly` (€17.00)
   - GBP: `price_starter_gbp_monthly` (£16.00)

2. **DBにPrice IDを保存**:
   ```sql
   UPDATE plans SET 
     stripe_price_ids = '{"usd": "price_xxx", "jpy": "price_yyy", "eur": "price_zzz", "gbp": "price_www"}'::jsonb
   WHERE name = 'starter';
   ```

### 5. 通貨の自動判定

**優先順位**:
1. ユーザーが手動で選択した通貨
2. ユーザーのロケールから自動判定（`ja` → JPY, `en` → USD等）
3. デフォルト: USD

### 6. 価格表示

- 価格ページで通貨選択ドロップダウンを表示
- 選択された通貨に応じて価格を自動変換・表示
- 固定為替レートを使用して計算

## 次のステップ

### 1. Stripe Dashboardでの設定

各プランごとに各通貨のPrice IDを作成:
- スターター: USD, JPY, EUR, GBP
- スタンダード: USD, JPY, EUR, GBP
- ビジネス: USD, JPY, EUR, GBP

### 2. マイグレーションの実行

```sql
-- Supabaseダッシュボードで実行
-- 002_add_stripe_fields.sql
-- 003_add_multi_currency_support.sql
```

### 3. Price IDの登録

各プランの`stripe_price_ids`にPrice IDを登録

### 4. テスト

- 各通貨でのチェックアウトフローのテスト
- 価格表示の確認
- 為替レートの計算確認

## 注意事項

1. **為替レートの更新**: 四半期ごとなど定期的に見直し
2. **価格の一貫性**: Stripe DashboardとDBの価格を同期
3. **税務**: 各国の消費税/VATの扱いを確認（Stripeが自動処理する場合あり）
4. **新規通貨の追加**: `lib/billing/currency.ts`の`Currency`型と`DEFAULT_EXCHANGE_RATES`を更新

