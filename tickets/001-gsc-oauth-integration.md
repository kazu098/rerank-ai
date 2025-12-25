# チケット #001: GSC連携（OAuth 2.0）

## 概要
Google Search Console APIとOAuth 2.0で連携し、自社サイトの順位データを取得できるようにする。

## 目的
自社サイトの順位データを取得するための基盤を構築する。

## 実装内容

### 1. Google Cloud Consoleでアプリ作成
- [ ] Google Cloud Consoleでプロジェクトを作成
- [ ] OAuth 2.0認証情報を作成
- [ ] リダイレクトURIを設定
- [ ] スコープ: `https://www.googleapis.com/auth/webmasters.readonly` を設定

### 2. OAuth 2.0認証の実装
- [ ] NextAuth.jsをインストール・設定
- [ ] Googleプロバイダーの設定
- [ ] 認証フロー（ログイン → リダイレクト → トークン取得）の実装
- [ ] セッション管理の実装

### 3. GSC API連携
- [ ] Google Search Console APIクライアントの実装
- [ ] アクセストークンの取得・管理
- [ ] API呼び出しのエラーハンドリング
- [ ] リトライ機能の実装

### 4. 順位データ取得機能
- [ ] 特定記事（URL）の時系列データ取得
- [ ] キーワード（クエリ）ごとの順位データ取得
- [ ] データのパース・整形

## 成果物
- OAuth認証機能
- GSC API連携機能
- 順位データ取得機能

## 技術スタック
- **認証**: NextAuth.js
- **API**: Google Search Console API
- **実行環境**: Vercel

## テスト項目
- [ ] OAuth認証が正常に動作する
- [ ] GSC APIから順位データが取得できる
- [ ] エラーハンドリングが適切に動作する
- [ ] トークンのリフレッシュが正常に動作する

## 見積もり
**期間**: 1-2日

## 関連ドキュメント
- [最小実装仕様](../docs/minimum-viable-implementation.md)
- [GSC連携戦略](../docs/gsc-integration-strategy.md)
- [GSC APIデータ構造](../docs/gsc-api-data-structure.md)

