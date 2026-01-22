# Vercelタイムアウトエラーの修正

## 問題の概要

以下のエラーが発生していました：
- `Vercel Runtime Timeout Error: Task timed out after 60 seconds`
- `Failed to execute 'text' on 'Response': body stream already read`

## 原因

1. **デフォルトタイムアウトが60秒のまま**
   - `vercel.json`のデフォルト設定が60秒のままになっていた
   - Proプランで5分（300秒）に設定したつもりだったが、デフォルトが60秒のまま

2. **長時間実行されるエンドポイントがタイムアウト設定に含まれていない**
   - 記事改善案生成（`/api/article-improvement/generate`）
   - 記事提案生成（`/api/article-suggestions/generate`）
   - GSCプロパティ取得（`/api/gsc/properties`）
   - 詳細分析データ取得（`/api/analysis/detailed`）

3. **レスポンスボディの二重読み込みの可能性**
   - `app/api/gsc/properties/route.ts`でエラー時と成功時で同じレスポンスオブジェクトを使用
   - 理論的には問題ないが、タイムアウト時などに問題が発生する可能性

## 修正内容

### 1. `vercel.json`のデフォルトタイムアウトを300秒に変更

```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300  // 60秒 → 300秒に変更
    }
  }
}
```

### 2. 長時間実行されるエンドポイントを明示的に追加

以下のエンドポイントを300秒に設定：

- `app/api/article-improvement/generate/route.ts`
- `app/api/article-suggestions/generate/route.ts`
- `app/api/gsc/properties/route.ts`
- `app/api/analysis/detailed/route.ts`

### 3. エラーハンドリングの改善

`app/api/gsc/properties/route.ts`のコメントを追加し、エラー時と成功時でレスポンスボディを読み込むロジックを明確化。

## 確認事項

### Vercel Proプランの設定確認

1. VercelダッシュボードでProプランになっているか確認
2. プロジェクト設定でタイムアウト設定が反映されているか確認
3. デプロイ後に`vercel.json`の設定が適用されているか確認

### デプロイ後の確認

1. エラーが発生していたエンドポイントで再度テスト
2. タイムアウトエラーが発生しないか確認
3. レスポンスボディの二重読み込みエラーが発生しないか確認

## 注意事項

- Vercelの設定変更は、デプロイ後に反映されます
- タイムアウト設定は、Vercel Proプランで最大300秒（5分）まで設定可能です
- それ以上の時間が必要な場合は、GitHub Actionsへの移行を検討してください（参考: `docs/github-actions-migration-guide.md`）

## 関連ドキュメント

- `docs/github-actions-migration-guide.md`: GitHub Actionsへの移行ガイド（長時間実行が必要な場合）
