# GSC API リクエスト比較：OAuth 2.0 Playground vs 実装

## OAuth 2.0 Playgroundのリクエスト（成功）

```json
{
  "startDate": "2025-11-20",
  "endDate": "2025-12-24",
  "dimensions": ["query"],
  "dimensionFilterGroups": [
    {
      "filters": [
        {
          "dimension": "page",
          "operator": "equals",
          "expression": "https://kazulog.fun/note/the-meaning-of-smart/"
        }
      ]
    }
  ],
  "rowLimit": 100
}
```

**サイトURL**: `https://kazulog.fun/` (末尾スラッシュあり)

## 現在の実装

### 期間の計算
- `endDate`: `Date.now() - 2 * 24 * 60 * 60 * 1000` (2日前)
- `startDate`: `Date.now() - 32 * 24 * 60 * 60 * 1000` (32日前)

**2025年12月26日時点での計算結果**:
- `endDate`: `2025-12-24`
- `startDate`: `2025-11-24`

### ページURLの処理

1. **`app/page.tsx` (306行目)**:
   ```typescript
   const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
   ```
   - 結果: `/note/the-meaning-of-smart/` (相対パス)

2. **`lib/gsc-api.ts` (139-152行目)**:
   ```typescript
   if (pageUrl.startsWith("/")) {
     const siteUrlWithoutSlash = normalizedSiteUrl.replace(/\/$/, "");
     normalizedPageUrl = `${siteUrlWithoutSlash}${pageUrl}`;
   }
   ```
   - `normalizedSiteUrl`: `https://kazulog.fun/` → `https://kazulog.fun` (末尾スラッシュ削除)
   - 結果: `https://kazulog.fun/note/the-meaning-of-smart/`

## 差分の可能性

### 1. 期間の違い
- **Playground**: `2025-11-20` ～ `2025-12-24` (35日間)
- **実装**: `2025-11-24` ～ `2025-12-24` (31日間)

**影響**: 4日分のデータが欠落している可能性がありますが、これは大きな差ではないはずです。

### 2. サイトURLの形式
- **Playground**: `https://kazulog.fun/` (末尾スラッシュあり)
- **実装**: `https://kazulog.fun` (末尾スラッシュ削除)

**影響**: GSC APIの`siteUrl`パラメータは、末尾スラッシュの有無で異なるプロパティとして扱われる可能性があります。

### 3. ページURLの形式
両方とも `https://kazulog.fun/note/the-meaning-of-smart/` になるはずなので、これは問題ないはずです。

## 推奨される修正

1. **サイトURLの正規化を確認**: GSCプロパティとして登録されている形式（末尾スラッシュの有無）を保持する
2. **期間の計算を調整**: より長い期間を取得する（例: 過去90日間）
3. **デバッグログの追加**: 実際に送信されているリクエストをログ出力して確認

