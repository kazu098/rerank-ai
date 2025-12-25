# チケット一覧

## 最小実装（MVP）の実装チケット

自社サイトで効果を実感するための最小実装を7つのチケットに分割しています。

### 実装順序

1. **[#001: GSC連携（OAuth 2.0）](./001-gsc-oauth-integration.md)** (1-2日)
   - Google Search Console APIとOAuth 2.0で連携
   - 順位データ取得の基盤を構築

2. **[#002: 順位下落検知ロジック](./002-rank-drop-detection.md)** (1日)
   - 急落を自動検知
   - 分析対象のキーワードを選定

3. **[#003: 競合URL取得（ブラウジングツール）](./003-competitor-url-extraction.md)** (2-3日)
   - PlaywrightでGoogle検索を実行
   - 自社URLより上位の競合URLを抽出

4. **[#004: 競合記事スクレイピング](./004-competitor-scraping.md)** (1-2日)
   - cheerioでHTMLパース
   - テキスト抽出

5. **[#005: 差分分析とリライト案生成](./005-diff-analysis-rewrite-generation.md)** (2-3日)
   - Gemini 2.5 Flashで差分分析
   - 箇条書き形式でリライト案を生成

6. **[#006: 通知機能](./006-notification.md)** (1-2日)
   - メール通知（Resend）
   - Slack/LINE通知（オプション）

7. **[#007: 定期実行（Cron）](./007-cron-scheduled-execution.md)** (1日)
   - Vercel Cronで毎日自動実行
   - 全フローの統合

### 合計期間
**約2週間（10-14日）**

### 前提条件
- GSC連携は必須
- 自社サイトで効果を実感したい
- フロントエンドは最小限（バックエンドロジックに集中）

### 関連ドキュメント
- [最小実装仕様](../docs/minimum-viable-implementation.md)
- [実装優先順位](../docs/implementation-priority.md)
- [技術スタック](../docs/technical-stack.md)

