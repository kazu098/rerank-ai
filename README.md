# ReRank AI (MVP)

## プロダクト概要

ユーザーの記事URLを入力するだけで、Google Search Console（GSC）の順位データと競合サイトのコンテンツを自動解析し、検索順位を上げるための「追加すべき項目の箇条書き」を提示するSEO自動化ツール。

**「何もしなくても、勝てる修正案が降ってくる」**体験を提供します。

## コアバリュー

### 包括的なアプローチ

- **順位下落時**: 異変を検知し、競合が追加した要素を特定
- **現状低迷時**: 伸びしろを発見し、上位サイトに欠けている要素を特定

どちらのケースでも、同じロジック（差分抽出）で対応し、**「記事を書きっぱなしにしているすべての人」**がターゲットになります。

## クイックスタート

### ドキュメント構成

詳細な仕様は `docs/` ディレクトリに整理されています：

- [プロダクト概要](./docs/product-overview.md) - 包括的な仕様と市場戦略
- [MVP仕様](./docs/mvp-specification.md) - 機能詳細と分析ロジック
- [GSC連携戦略](./docs/gsc-integration-strategy.md) - Search Console APIの敷居を下げる3つの戦略
- [GSC APIデータ構造](./docs/gsc-api-data-structure.md) - 取得可能なデータと実装例
- [Serper APIの必要性](./docs/serper-api-necessity.md) - Serper APIが必要な理由と用途
- [ブラウジングツールの精度分析](./docs/browser-tool-accuracy-analysis.md) - ブラウジングツールの精度と対策
- [技術スタック](./docs/technical-stack.md) - 使用APIと技術構成
- [技術スタック最適化分析](./docs/technical-stack-optimization.md) - 技術スタックの評価と最適化提案
- [コスト見積もり](./docs/cost-estimation.md) - 1記事あたりのコスト内訳
- [料金プラン](./docs/pricing-plans.md) - 無料枠と有料プランの設計
- [ユーザージャーニー](./docs/user-journey.md) - First Wow Experienceの設計
- [最小実装仕様](./docs/minimum-viable-implementation.md) - 自社サイトで効果を実感するための最小実装
- [実装優先順位](./docs/implementation-priority.md) - 開発の優先順位とフェーズ
- [競合分析](./docs/competitive-analysis.md) - 競合サービスの洗い出しと競合優位性の評価
- [仕様確定のための質問](./docs/questions-for-specification.md) - 深掘りすべき点と確認事項

## 主な機能（MVP）

1. **手動スキャン（GSC連携不要）**: URLとキーワードを入力するだけで、現在の順位と改善案を即座に表示
2. **自動トリガー（GSC連携後）**: 順位下落を検知し、自動で分析・通知（OAuth 2.0で1クリック認証）
3. **競合との差分抽出**: 上位サイトとの違いを特定
4. **追加すべき項目の箇条書き**: 競合と比べて抜けている項目を具体的に提示

## 技術スタック

- **Frontend**: Next.js (App Router), Tailwind CSS
- **Backend**: Node.js / Next.js API Routes
- **APIs**: 
  - ブラウジングツール（Playwright推奨。GSC APIで取得したキーワードと順位をもとに、Google検索を実行して競合URLを取得）
  - Google Search Console API（順位データ・キーワード取得・自動通知用、OAuth 2.0で連携）
  - 自前クローラー（cheerio推奨。Node.jsで競合記事スクレイピング）
  - Gemini 2.5 Flash（差分分析・追加項目提案の生成）
- **通知**: Resend（メール推奨）、Slack Webhook、LINE Notify
- **実行環境**: Vercel（推奨。Next.jsとの統合が完璧、Cron機能が標準搭載）
- **データベース**: Supabase（推奨。無料枠が充実、PostgreSQLベース）

## コスト・収益モデル

- **原価**: 1記事分析あたり約2.5円（API合計、ブラウジングツールとクローラーは自前のためコスト0円）
- **無料枠**: 月3回までの無料スキャン（未ログイン時は簡易版）
- **有料プラン**: 
  - スターター (2,980円/月): 20回分析（週1-2回、月8-10記事の分析が可能）
  - スタンダード (9,800円/月): 100回分析（週3-5回、月20-50記事の分析が可能）
  - ビジネス (29,800円/月): 無制限（同時実行制限あり）

## 開発開始時の指示

### 最小実装（自社サイトで効果を実感）

プロジェクト開始時に以下のように指示してください：

「@README.md と @docs/minimum-viable-implementation.md を読み込んでください。GSC連携は必須です。まずはOAuth 2.0でGSC連携を実装し、順位下落を検知したら、ブラウジングツール（Playwright推奨）で競合URLを取得し、自前クローラー（cheerio推奨）で内容をスクレイピングし、Gemini 2.5 Flashで追加すべき項目の箇条書きを生成してメール通知（Resend推奨）する最小のバックエンドスクリプトを作成してください。実行環境はVercel、データベースはSupabaseを推奨します。」

詳細は [最小実装仕様](./docs/minimum-viable-implementation.md) と [実装優先順位](./docs/implementation-priority.md) を参照してください。
