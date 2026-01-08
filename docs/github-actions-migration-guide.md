# GitHub Actionsへの移行ガイド（check-rank）

## 現状の問題

### 現在の実装（Vercel Cron）

1. **監視対象の全記事を順次処理**
   - `getMonitoringArticles()`で`is_monitoring=true`の全記事を取得
   - 各記事に対して順次（`for`ループ）でGSC APIを呼び出し
   - 記事数が増えると処理時間が線形に増加

2. **タイムアウトの制約**
   - Vercelの無料プラン: 10秒
   - Proプランでも最大300秒（5分）まで
   - 記事数が増えるとタイムアウトのリスクが高まる

### 例：処理時間の見積もり

- 記事1件あたり約2-5秒（GSC API呼び出し + DB処理）
- 100記事: 約3-8分
- 500記事: 約17-42分
- 1000記事: 約33-83分

**結論**: サービスが成長すると、Vercelのタイムアウト制限内で処理が完了しなくなる可能性が高い

---

## GitHub Actionsへの移行

### メリット

1. **タイムアウト時間が長い**
   - デフォルト: 360分（6時間）まで設定可能
   - 記事数が増えても対応可能

2. **サーバーレス関数の制約がない**
   - メモリ制限やCPU制限がない
   - 長時間実行が可能

3. **既存の`send-notifications`と同じパターン**
   - 既に`send-notifications.yml`で実装済み
   - 同じ構造で実装可能

4. **手動実行も容易**
   - GitHub Actionsのダッシュボードから手動実行可能
   - スケジュール実行も自動

### デメリット

1. **GitHub Actionsの制限**
   - 無料プラン: 2,000分/月（プライベートリポジトリ）
   - パブリックリポジトリ: 無制限
   - 1日1回実行で約30分かかると想定すると、月約900分

2. **APIエンドポイントはそのまま利用**
   - コードの変更は不要
   - 認証（CRON_SECRET）も同じ

---

## 実装方法

### 1. GitHub Actionsワークフローの作成

`.github/workflows/check-rank.yml`を作成済み。

### 2. GitHub Secretsの設定

GitHubリポジトリのSettings → Secrets and variables → Actionsで以下を設定：

- `CRON_SECRET`: Vercelの環境変数と同じ値
- `VERCEL_URL` (Repository Variable): `https://www.rerank-ai.com`

### 3. Vercel Cronの無効化（推奨）

`vercel.json`からcron設定を削除するか、スケジュールをコメントアウト：

```json
{
  "crons": [
    // GitHub Actionsで実行するため無効化
    // {
    //   "path": "/api/cron/check-rank",
    //   "schedule": "0 15 * * *"
    // }
  ]
}
```

---

## タイムアウトの解消

### GitHub Actionsでのタイムアウト設定

現在の設定: `timeout-minutes: 60`（最大60分）

記事数に応じて調整可能：

```yaml
timeout-minutes: 60  # 100記事程度
timeout-minutes: 120 # 500記事程度
timeout-minutes: 180 # 1000記事程度
timeout-minutes: 360 # 最大（6時間）
```

### 処理時間の最適化（将来）

現在は順次処理ですが、将来的には以下の最適化が可能：

1. **バッチ処理**
   - 記事を100件ずつに分割
   - 複数のGitHub Actionsジョブで並列実行

2. **並列処理**
   - 同じユーザーの記事をまとめて処理
   - GSCクライアントの再利用で効率化

3. **優先度付け**
   - 緊急度の高い記事を優先処理
   - 過去の通知頻度に応じて優先度を調整

---

## 移行手順

1. ✅ GitHub Actionsワークフローファイル作成（完了）
2. ⏳ GitHub Secretsの設定
3. ⏳ テスト実行（手動トリガー）
4. ⏳ Vercel Cronの無効化
5. ⏳ 本番環境での動作確認

---

## 実行方法

### 手動実行

1. GitHubリポジトリ → Actions
2. "Check Rank Drops"ワークフローを選択
3. "Run workflow"をクリック

### スケジュール実行

毎日UTC 15:00（日本時刻 0:00）に自動実行されます。

---

## モニタリング

GitHub Actionsのログで以下を確認：

- 処理した記事数
- エラーが発生した記事
- 処理時間
- 通知が作成された数

---

## FAQ

### Q: VercelのAPIエンドポイントはそのまま使えますか？

**A**: はい、そのまま使えます。GitHub Actionsからcurlで呼び出すだけです。

### Q: タイムアウトの問題は完全に解消されますか？

**A**: はい、GitHub Actionsのタイムアウト時間（最大360分）内で処理が完了すれば問題ありません。ただし、記事数が極端に増えた場合は、処理の最適化が必要です。

### Q: `send-notifications`と同じパターンで実装できますか？

**A**: はい、同じパターンで実装できます。既に`send-notifications.yml`で実装済みなので、それを参考にしてください。

### Q: コストはかかりますか？

**A**: パブリックリポジトリの場合は無料です。プライベートリポジトリの場合は、GitHubの無料枠（2,000分/月）内で収まる想定です。
