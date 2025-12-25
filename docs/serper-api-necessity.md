# Serper APIの必要性分析

## 代替案：ブラウジングツールの使用

### ブラウジングツールでSerper APIを代替可能

**提案**: GSC APIで取得したキーワードと順位をもとに、ブラウジングツール（Cursorのブラウジングツール、Playwright、Puppeteer等）でGoogle検索を実行し、自社より上位のサイトURLを取得

**メリット**:
1. **Serper APIのコストを削減**（約1.5円 → 0円）
2. **総コストの削減**（約4.0円 → 約2.5円、約37.5%削減）
3. **GSC APIと統合しやすい**（キーワードと順位のデータをそのまま活用）

**デメリット・考慮事項**:
1. **実行時間**: ブラウジングツールはSerper APIより遅い可能性（数秒〜数十秒）
2. **CAPTCHA対応**: Google検索でCAPTCHAが表示される可能性（対策が必要）
3. **レート制限**: 過度なリクエストでIPブロックされる可能性
4. **サーバーリソース**: ブラウザインスタンスの起動にリソースが必要（固定費として計上）
5. **信頼性**: ブラウジングツールが失敗する可能性（リトライ機能が必要）

**実装方法**:
```javascript
// GSC APIで取得したキーワードと順位をもとに
const keywords = await getKeywordsFromGSC(articleUrl);
const myPosition = keywords[0].position; // 例: 6.7位

// ブラウジングツールでGoogle検索を実行
const searchResults = await browserTool.searchGoogle(keywords[0].query);

// 自社URLより上位のサイトURLを抽出
const competitorUrls = searchResults
  .filter(result => result.position < myPosition)
  .map(result => result.url);
```

## Serper APIの用途（代替案あり）

### 1. 競合URLの取得

**方法A: Serper API（従来）**
- **コスト**: 約1.5円/リクエスト
- **速度**: 高速（1-2秒）
- **信頼性**: 高い
- **結論**: コストがかかるが、高速で信頼性が高い

**方法B: ブラウジングツール（提案）**
- **コスト**: 0円（サーバーリソースのみ）
- **速度**: やや遅い（5-10秒）
- **信頼性**: 中程度（CAPTCHA対応が必要）
- **結論**: コスト削減できるが、実装が複雑

**推奨**: **MVPではブラウジングツールを採用**（コスト削減のため）。信頼性が問題になった場合はSerper APIに切り替え可能。

**精度**:
- **競合URL取得**: 80-95%（CAPTCHA対応により向上可能）
- **順位特定**: 70-90%（GSC連携時は95%以上）
- **対策**: CAPTCHA検出とリトライ、リクエスト間隔の調整、フォールバック機能

詳細は [ブラウジングツールの精度分析](./browser-tool-accuracy-analysis.md) を参照。

**使用タイミング**:
- GSC連携時: GSC APIで取得したキーワードと順位をもとに、ブラウジングツールで競合URLを取得
- 手動スキャン時: 入力されたキーワードでブラウジングツールを使用

### 2. 現在の順位特定（条件付きで必要）

**用途**: キーワードで検索し、自社URLの順位を取得

**方法A: Serper API**
- **コスト**: 約1.5円/リクエスト
- **速度**: 高速

**方法B: ブラウジングツール**
- **コスト**: 0円
- **速度**: やや遅い

**使用タイミング**:
- **GSC連携時**: **不要**（GSC APIから「どのキーワードでどの順位」というデータを取得可能）
- **手動スキャン時（GSC連携不要）**: **必要**（現在の順位を表示するため）
  - ブラウジングツールでGoogle検索を実行し、自社URLの順位を特定

**結論**: **条件付きで必要**（GSC連携不要の場合のみ）。ブラウジングツールで代替可能。

## まとめ

### Serper APIは不要（ブラウジングツールで代替可能）

**理由**:
1. **競合URLの取得**: ブラウジングツールでGoogle検索を実行可能
2. **手動スキャン時の順位特定**: ブラウジングツールで検索結果から順位を特定可能

**コスト削減**:
- **変更前**: 約1.5円/リクエスト（Serper API）
- **変更後**: 0円（ブラウジングツール、サーバーリソースのみ）
- **総コスト削減**: 約4.0円 → 約2.5円（約37.5%削減）

**実装方針**:
- **MVP**: ブラウジングツールを採用（コスト削減のため）
- **フォールバック**: 信頼性が問題になった場合はSerper APIに切り替え可能

## 実装上の考慮

### GSC連携時（ブラウジングツール使用）
```javascript
// GSC APIからキーワードと順位を取得
const keywords = await getKeywordsFromGSC(articleUrl);
const myPosition = keywords[0].position; // 例: 6.7位

// ブラウジングツールでGoogle検索を実行
const searchResults = await browserTool.searchGoogle(keywords[0].query);

// 自社URLより上位のサイトURLを抽出
const competitorUrls = searchResults
  .filter(result => result.position < myPosition)
  .map(result => result.url);
```

### 手動スキャン時（GSC連携不要・ブラウジングツール使用）
```javascript
// ブラウジングツールでGoogle検索を実行
const searchResults = await browserTool.searchGoogle(keyword);

// 自社URLの順位を特定
const myPosition = searchResults.findIndex(result => result.url === myUrl) + 1;

// 自社URLより上位のサイトURLを抽出
const competitorUrls = searchResults
  .filter(result => result.position < myPosition)
  .map(result => result.url);
```

### CAPTCHA対応
- CAPTCHAが表示された場合のリトライ機能
- ユーザーエージェントのローテーション
- リクエスト間隔の調整（レート制限回避）

