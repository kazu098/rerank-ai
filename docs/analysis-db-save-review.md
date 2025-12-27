# 分析結果DB保存の実装レビュー

## 現在の実装状況

### ✅ 実装済み
- `analysis_runs` テーブルに実行履歴を保存
- `analysis_results` テーブルに分析結果サマリーを保存
  - 平均順位、前回順位、変化量
  - 分析対象キーワード
  - 下落キーワード（10位以下）
  - 上位キーワード（1-5位）
  - 推奨追加項目（`recommended_additions`）
  - 不足内容の要約（`missing_content_summary`）
  - 競合サイト数

### ❌ 未実装・不足している点

#### 1. 詳細データの保存
- `detailed_result_storage_key` を保存していない
- `detailed_result_expires_at` を保存していない
- 詳細データ（競合記事の全文、LLM分析の詳細など）を一時ストレージに保存していない

#### 2. 通知メールに必要な情報
現在の通知メール実装では、以下の情報が必要：
- `analysisResult.prioritizedKeywords` ✅ 保存済み
- `analysisResult.semanticDiffAnalysis?.semanticAnalysis?.recommendedAdditions` ✅ 保存済み（`recommended_additions`）
- `analysisResult.semanticDiffAnalysis?.semanticAnalysis?.missingContent` ✅ 保存済み（`missing_content_summary`）
- `analysisResult.uniqueCompetitorUrls` ❌ 保存していない（`competitor_count` のみ）
- `analysisResult.diffAnalysis` ❌ 保存していない（基本的な差分分析結果）

**問題点**: 
- Cronジョブで通知を送信する際、完全な `CompetitorAnalysisSummary` が必要だが、現在は簡易版のみ作成している
- 通知メールに競合URL一覧を表示する必要があるが、現在は保存していない

#### 3. 詳細画面へのアクセス
- `notifications` テーブルに `analysis_result_id` を保存していない
- `notifications` テーブルに `detail_report_url` を保存していない
- 詳細画面へのアクセス方法が実装されていない

## 改善が必要な点

### 1. 詳細データの保存（優先度: 高）
**目的**: 詳細画面で分析結果の詳細を表示するため

**実装内容**:
1. 詳細データを一時ストレージ（Vercel Blob Storage等）に保存
2. `detailed_result_storage_key` と `detailed_result_expires_at` をDBに保存
3. 詳細データの内容:
   - 自社記事の全文（`diffAnalysis.ownArticle`）
   - 競合記事の全文（`diffAnalysis.competitorArticles`）
   - LLM分析の詳細（`semanticDiffAnalysis`）
   - 時系列データ（`keywordTimeSeries`）
   - 競合URL一覧（`uniqueCompetitorUrls`）

**期間**: 1-2日

### 2. 通知メールに必要な情報の追加保存（優先度: 中）
**目的**: Cronジョブで通知を送信する際、完全な分析結果を使用するため

**実装内容**:
1. `analysis_results` テーブルに以下を追加:
   - `competitor_urls` JSONB - 競合URL一覧
   - `diff_analysis_summary` JSONB - 基本的な差分分析のサマリー（見出し差分、文字数差分など）
2. または、詳細データから取得できるようにする（推奨）

**期間**: 0.5-1日

### 3. 通知履歴と分析結果の紐付け（優先度: 高）
**目的**: 通知メールから詳細画面にアクセスできるようにするため

**実装内容**:
1. `notifications` テーブルに `analysis_result_id` を保存
2. `notifications` テーブルに `detail_report_url` を生成して保存
3. 詳細画面へのアクセス方法を実装（トークンベースの認証）

**期間**: 1-2日

## 結論

### 現在の実装で可能なこと
- ✅ 通知メールの基本情報（順位下落、推奨追加項目）は表示可能
- ✅ ダッシュボードで分析結果のサマリーを表示可能

### 現在の実装で不可能なこと
- ❌ 詳細画面で分析結果の詳細を表示（詳細データが保存されていない）
- ❌ 通知メールから詳細画面に直接アクセス（`detail_report_url` がない）
- ❌ 通知メールに競合URL一覧を表示（`uniqueCompetitorUrls` が保存されていない）

### 推奨される改善順序
1. **詳細データの保存**（最優先）
   - 詳細画面へのアクセスに必要
   - 通知メールから詳細を確認できるようにするため
2. **通知履歴と分析結果の紐付け**
   - 通知メールから詳細画面にアクセスできるようにするため
3. **通知メールに必要な情報の追加保存**
   - 競合URL一覧などを通知メールに表示するため

## 実装の優先度

### 最小限の実装（通知機能を動作させる）
- 現在の実装で通知メールは送信可能（推奨追加項目は表示される）
- ただし、競合URL一覧は表示されない
- 詳細画面へのアクセスは不可

### 完全な実装（推奨）
- 詳細データの保存
- 通知履歴と分析結果の紐付け
- 通知メールに競合URL一覧を追加

