# 通貨自動判定機能の実装

## 概要

ユーザーのロケール（言語設定）に基づいて、通貨を自動判定する機能を実装しました。

**重要な設計方針**: 通貨は常にロケールから導出されます。ロケールが決まれば通貨も自動的に決まります。

## ベストプラクティスに基づく実装

### 優先順位（高い順）

1. **明示的なユーザー選択** - ユーザーが手動で通貨を選択した場合（一時的な選択）
2. **ユーザーロケール設定** - データベースに保存されたユーザーのロケール（`ja` → JPY, `en` → USD）
3. **ブラウザ言語設定** - `Accept-Language`ヘッダーからロケールを取得（初回訪問時など）
4. **デフォルト** - USD（上記すべてが利用できない場合）

### ロケールと通貨の対応

- `ja` → JPY
- `en` → USD
- `de`, `fr`, `es`, `it`など → EUR
- `en-GB` → GBP

**注意**: GeoIP（IPアドレスベースの判定）は使用していません。コストを避けるため、ブラウザの`Accept-Language`ヘッダーのみを使用しています。

### 実装の詳細

#### 1. データベース変更

- **重要**: 通貨はロケールから動的に導出されるため、データベースに保存する必要はありません

#### 2. ブラウザ言語設定の活用

- `Accept-Language`ヘッダーからロケールを抽出
- サポートしている言語（`ja`, `en`）のみを考慮
- ロケールから通貨を自動的に導出（`ja` → JPY, `en` → USD）

#### 3. GeoIPの非使用

- コストを避けるため、IPアドレスベースのGeoIP判定は使用していません
- ブラウザの`Accept-Language`ヘッダーのみを使用します

#### 4. 実装されたファイル

**新規作成:**
- `app/api/currency/detect/route.ts` - 通貨判定API（ロケールベース）

**更新:**
- `lib/billing/currency.ts` - ロケールベースの判定関数を追加
  - `detectCurrencyFromLocale()` - ロケールベースの通貨判定（推奨）
  - `getLocaleFromAcceptLanguage()` - Accept-Languageヘッダーからロケール抽出
  - `getCurrencyFromLocale()` - ロケールから通貨への変換
  - **削除**: GeoIP関連の関数（`getCountryCodeFromIp`, `getCurrencyFromCountryCode`）
- `app/api/billing/checkout/route.ts` - ロケールベースの自動判定を活用
- `app/api/billing/subscription/change/route.ts` - ロケールベースの自動判定を活用
- `components/landing/PricingSection.tsx` - クライアント側で自動判定を使用

## 使用例

### APIエンドポイント

```typescript
// 通貨を自動判定
GET /api/currency/detect
// Response: { success: true, currency: "JPY" }

// ユーザーの希望通貨を保存
POST /api/users/update-currency
Body: { currency: "JPY" }
```

### クライアント側

```typescript
// PricingSectionコンポーネントで自動判定を利用
useEffect(() => {
  const detectCurrency = async () => {
    const response = await fetch("/api/currency/detect");
    const data = await response.json();
    if (data.success) {
      setSelectedCurrency(data.currency);
    }
  };
  detectCurrency();
}, []);
```

## 利点

1. **ユーザー体験の向上** - 初回訪問時にブラウザ言語に基づいて適切な通貨が自動表示
2. **シンプルさ** - ロケールと通貨が連動しているため、管理が容易
3. **コスト削減** - GeoIP APIを使用しないため、外部APIコストがかからない
4. **一貫性** - ロケールが変更されれば、通貨も自動的に変更される
5. **パフォーマンス** - 外部APIへのリクエストがないため、高速

## 注意事項

1. **ロケールと通貨の連動**
   - 通貨を変更したい場合は、ロケール設定を変更してください
   - 一時的な通貨選択は可能ですが、データベースには保存されません

2. **ブラウザ言語設定**
   - `Accept-Language`ヘッダーが設定されていない場合、デフォルト（USD）が使用されます
   - ユーザーがロケールを手動で設定すれば、そのロケールに基づいて通貨が決定されます

3. **初回訪問時**
   - 未ログインユーザーは、ブラウザの`Accept-Language`ヘッダーに基づいて通貨が判定されます
   - ログインユーザーは、データベースに保存されたロケール設定が優先されます

## 今後の拡張可能性

1. **より多くのロケール対応** - 必要に応じてロケールと通貨のマッピングを拡張（例: `fr` → EUR, `de` → EUR）
2. **ロケール設定の自動保存** - 初回訪問時にブラウザ言語を自動的にデータベースに保存
3. **複数ロケール対応** - 同じ言語でも国によって通貨が異なる場合の対応（例: `en-US` → USD, `en-GB` → GBP）

