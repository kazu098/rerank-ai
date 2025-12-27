# GSC APIレスポンスで`rows`が含まれない場合

## 1. データが存在しない場合（正常なレスポンス）

指定した条件に該当するデータが存在しない場合、GSC APIは以下のようなレスポンスを返します：

```json
{
  "rows": [],
  "responseAggregationType": "byPage"
}
```

**発生するケース：**
- 指定した期間に検索結果に表示されなかった
- 指定したページURLに該当するデータがない
- 指定したキーワードに該当するデータがない
- 新しいページで、まだGSCにデータが反映されていない（通常2-3日遅延）

## 2. エラーレスポンスの場合

APIエラーが発生した場合、レスポンス構造が異なる可能性があります：

```json
{
  "error": {
    "code": 400,
    "message": "Invalid date range",
    "errors": [...]
  }
}
```

この場合、`rows`プロパティ自体が存在しません。

## 3. 空のレスポンス

まれに、以下のような空のレスポンスが返される場合があります：

```json
{
  "responseAggregationType": "byPage"
}
```

`rows`プロパティが完全に欠落している場合。

## 4. データ処理遅延

GSCのデータはリアルタイムではなく、以下のような遅延があります：
- **通常**: 2-3日前のデータまで取得可能
- **新しいページ**: データ反映まで数日から1週間かかる場合がある
- **更新頻度**: 1日1回程度

## 5. 権限やプロパティの問題

- 指定したサイトURLがGSCプロパティに存在しない
- アクセストークンに必要な権限がない
- プロパティの設定が不完全

## 現在の実装での対応

現在のコードでは、以下のように安全に処理しています：

```typescript
// APIレスポンスから安全にrowsを取得
const keywordRows = Array.isArray(keywordData?.rows) ? keywordData.rows : [];

// または
const timeSeriesRows = Array.isArray(timeSeriesData?.rows) ? timeSeriesData.rows : [];
```

これにより、`rows`が存在しない場合でも空配列として処理され、エラーが発生しません。

