# Vercelタイムアウトエラーの修正

## 問題の概要

以下のエラーが発生していました：
- `Vercel Runtime Timeout Error: Task timed out after 60 seconds`
- `Failed to execute 'text' on 'Response': body stream already read`

## 原因

1. **長時間実行されるエンドポイントがタイムアウト設定に含まれていない**
   - 記事改善案生成（`/api/article-improvement/generate`）
   - 記事提案生成（`/api/article-suggestions/generate`）
   - GSCプロパティ取得（`/api/gsc/properties`）
   - 詳細分析データ取得（`/api/analysis/detailed`）

2. **レスポンスボディの二重読み込みの可能性**
   - `app/api/gsc/properties/route.ts`でエラー時と成功時で同じレスポンスオブジェクトを使用
   - 理論的には問題ないが、タイムアウト時などに問題が発生する可能性

## 修正内容

### 1. `vercel.json`のデフォルトタイムアウトを60秒に設定（Vercel Free対応）

Vercel Freeプランでは最大60秒（Fluid Compute有効時）まで設定可能です。

```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

### 2. 長時間実行されるエンドポイントを明示的に追加

以下のエンドポイントを60秒に設定：

- `app/api/article-improvement/generate/route.ts`
- `app/api/article-suggestions/generate/route.ts`
- `app/api/gsc/properties/route.ts`
- `app/api/analysis/detailed/route.ts`

### 3. エラーハンドリングの改善

`app/api/gsc/properties/route.ts`のコメントを追加し、エラー時と成功時でレスポンスボディを読み込むロジックを明確化。

## 確認事項

### Vercel Freeプランの設定確認

1. VercelダッシュボードでFreeプランにダウングレード済みか確認
2. Fluid Computeを有効にすると60秒まで利用可能（Settings → Functions）
3. デプロイ後に`vercel.json`の設定が適用されているか確認

### デプロイ後の確認

1. エラーが発生していたエンドポイントで再度テスト
2. タイムアウトエラーが発生しないか確認
3. レスポンスボディの二重読み込みエラーが発生しないか確認

## 注意事項

- Vercelの設定変更は、デプロイ後に反映されます
- タイムアウト設定は、Vercel Freeプランで最大60秒（Fluid Compute有効時）です
- 60秒を超える処理が必要な場合は、GitHub Actionsへの移行を検討してください（参考: `docs/github-actions-migration-guide.md`）

## 関連ドキュメント

- `docs/github-actions-migration-guide.md`: GitHub Actionsへの移行ガイド（長時間実行が必要な場合）
