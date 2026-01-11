# データベース設計

## 設計方針

### 1. ユーザージャーニーに沿った設計
- **試用フェーズ**: Googleログイン（GSC連携）で即座に検証可能
  - OAuth 2.0で1クリック認証（既に実装済み）
  - GSC連携後、そのプロパティのドメインの記事を分析可能
  - 敷居は低い（GoogleアカウントがあればOK）
  - **重要**: GSC APIの読み取り専用権限のみ（`webmasters.readonly`）
- **登録フェーズ**: アカウント作成後、プランに応じたURL登録制限
- **運用フェーズ**: 記事登録 → 定期実行 → 下落時通知 → 詳細レポート閲覧

### 1.1 GSC連携の懸念への対応
- **権限の明示**: 「読み取り専用」であることを明確に説明
- **データの使用目的**: 順位データの取得のみで、他の用途には使用しない
- **連携解除**: いつでも簡単に連携解除可能
- **セキュリティ**: OAuthトークンは暗号化して保存

### 1.2 認証設計
- **ログイン方法**: Googleアカウントでログイン（GSC API取得時に必要なアカウントと同じ）
  - メリット: シンプル、GSC連携と同時に認証完了
  - 既存実装: NextAuth.jsでGoogle OAuth認証（既に実装済み）
  - スコープ: `openid email profile https://www.googleapis.com/auth/webmasters.readonly`
- **セッション管理**: NextAuth.jsのセッション管理を活用
- **DB連携**: ログイン時に `users` テーブルにユーザー情報を保存/更新

### 2. データ保存の効率化
- **サマリーデータ**: DBに永続保存（通知・一覧表示用）
- **詳細データ**: 一時保存（S3/Blob Storage）または再生成可能な設計
- **分析結果**: 下落検知時のみ保存、通常の定期チェックはサマリーのみ

### 3. プラン設計
- URL登録数でプランを制限
- 月間分析回数も制限（プラン別）

## エンティティ設計

### 1. users（ユーザー）

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255), -- OAuthの場合はNULL
  provider VARCHAR(50), -- 'email', 'google', 'github' など
  provider_id VARCHAR(255), -- OAuthプロバイダーのID
  plan_id UUID REFERENCES plans(id),
  plan_started_at TIMESTAMP WITH TIME ZONE,
  plan_ends_at TIMESTAMP WITH TIME ZONE, -- サブスクリプション終了日
  trial_ends_at TIMESTAMP WITH TIME ZONE, -- トライアル終了日
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE -- ソフトデリート
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider ON users(provider, provider_id);
```

### 2. plans（プラン）

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL, -- 'free', 'starter', 'standard', 'business'
  display_name VARCHAR(100) NOT NULL, -- '無料', 'スターター', 'スタンダード', 'ビジネス'
  price_monthly INTEGER NOT NULL, -- 月額料金（円）
  max_articles INTEGER NOT NULL, -- 登録可能な記事URL数
  max_analyses_per_month INTEGER, -- 月間分析回数（NULLは無制限）
  max_sites INTEGER NOT NULL, -- GSC連携可能なサイト数
  max_concurrent_analyses INTEGER DEFAULT 1, -- 同時実行数
  features JSONB, -- プラン固有の機能設定
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**初期データ例**:
```sql
INSERT INTO plans (name, display_name, price_monthly, max_articles, max_analyses_per_month, max_sites, max_concurrent_analyses) VALUES
('free', '無料', 0, 3, 7, 1, 1),
('starter', 'スターター', 2980, 20, 20, 1, 1),
('standard', 'スタンダード', 9800, 100, 100, 3, 3),
('business', 'ビジネス', 29800, 300, 800, NULL, 10);
```

### 3. sites（サイト - GSC連携用）

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_url VARCHAR(500) NOT NULL, -- GSCのサイトURL（プロパティURL）
  display_name VARCHAR(255), -- ユーザーが設定する表示名
  gsc_access_token TEXT, -- GSC OAuth アクセストークン（暗号化必須）
  gsc_refresh_token TEXT, -- GSC OAuth リフレッシュトークン（暗号化必須）
  gsc_token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  is_trial BOOLEAN DEFAULT false, -- 試用中かどうか（試用時は記事を登録しない）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, site_url)
);

CREATE INDEX idx_sites_user_id ON sites(user_id);
CREATE INDEX idx_sites_is_active ON sites(is_active) WHERE is_active = true;
```

**注意事項**:
- OAuthトークンは**必ず暗号化**して保存（AES-256など）
- トークンの有効期限を管理し、期限切れ前にリフレッシュ
- ユーザーが連携解除した場合、トークンを削除

### 4. articles（記事URL）

```sql
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL, -- GSC連携時のみ設定
  url VARCHAR(1000) NOT NULL,
  title VARCHAR(500), -- 記事タイトル（スクレイピングで取得）
  keywords TEXT[], -- 分析対象キーワード（ユーザー指定または自動推測）
  is_monitoring BOOLEAN DEFAULT true, -- 定期監視するかどうか
  monitoring_frequency VARCHAR(50) DEFAULT 'daily', -- 'daily', 'weekly', 'manual'
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  last_rank_drop_at TIMESTAMP WITH TIME ZONE, -- 最後に順位下落が検知された日時
  current_average_position DECIMAL(5,2), -- 現在の平均順位
  previous_average_position DECIMAL(5,2), -- 前回の平均順位
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, url)
);

CREATE INDEX idx_articles_user_id ON articles(user_id);
CREATE INDEX idx_articles_site_id ON articles(site_id);
CREATE INDEX idx_articles_is_monitoring ON articles(is_monitoring) WHERE is_monitoring = true;
CREATE INDEX idx_articles_last_analyzed_at ON articles(last_analyzed_at);
```

### 5. analysis_runs（分析実行履歴）

```sql
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  trigger_type VARCHAR(50) NOT NULL, -- 'manual', 'scheduled', 'rank_drop'
  status VARCHAR(50) NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analysis_runs_article_id ON analysis_runs(article_id);
CREATE INDEX idx_analysis_runs_status ON analysis_runs(status) WHERE status IN ('pending', 'running');
```

### 6. analysis_results（分析結果サマリー）

```sql
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  
  -- 順位情報
  average_position DECIMAL(5,2),
  previous_average_position DECIMAL(5,2),
  position_change DECIMAL(5,2), -- 変化量（正の値は下落）
  
  -- キーワード情報（サマリー）
  analyzed_keywords TEXT[], -- 分析対象キーワード
  dropped_keywords JSONB, -- 下落したキーワード [{keyword, position, previousPosition, impressions}]
  top_keywords JSONB, -- 上位キーワード [{keyword, position, impressions, clicks}]
  
  -- 改善案（サマリー）
  recommended_additions JSONB, -- [{section, reason, item}] の配列
  missing_content_summary TEXT, -- 不足している内容の要約
  
  -- 詳細データへの参照
  detailed_result_storage_key VARCHAR(500), -- S3/Blob Storageのキーまたは一時保存ID
  detailed_result_expires_at TIMESTAMP WITH TIME ZONE, -- 詳細データの有効期限
  
  -- メタデータ
  competitor_count INTEGER, -- 分析した競合サイト数
  analysis_duration_seconds INTEGER, -- 分析にかかった時間
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analysis_results_article_id ON analysis_results(article_id);
CREATE INDEX idx_analysis_results_analysis_run_id ON analysis_results(analysis_run_id);
CREATE INDEX idx_analysis_results_created_at ON analysis_results(created_at DESC);
```

### 7. notifications（通知履歴）

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  
  notification_type VARCHAR(50) NOT NULL, -- 'rank_drop', 'manual_analysis', 'weekly_summary'
  channel VARCHAR(50) NOT NULL, -- 'email', 'slack', 'line'
  recipient VARCHAR(255) NOT NULL, -- 送信先（メールアドレス、Slackチャンネル、LINE IDなど）
  
  subject VARCHAR(500), -- 通知件名
  summary TEXT, -- 通知のサマリー（ダイジェスト）
  
  -- 詳細レポートへのリンク
  detail_report_url VARCHAR(1000), -- 詳細レポートへのURL（一時的なトークン付き）
  detail_report_expires_at TIMESTAMP WITH TIME ZONE, -- リンクの有効期限
  
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE, -- ユーザーが詳細レポートを閲覧した日時
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_article_id ON notifications(article_id);
CREATE INDEX idx_notifications_sent_at ON notifications(sent_at DESC);
```

### 8. notification_settings（通知設定）

```sql
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE, -- NULLの場合は全記事に適用
  
  -- 通知条件
  rank_drop_threshold DECIMAL(5,2) DEFAULT 2.0, -- 何位以上下落したら通知するか
  comparison_days INTEGER DEFAULT 7, -- 何日間の平均と比較するか
  keyword_drop_threshold DECIMAL(5,2) DEFAULT 10.0, -- キーワードが何位以下に転落したら通知するか
  
  -- 通知先
  email_enabled BOOLEAN DEFAULT true,
  email_addresses TEXT[], -- 複数のメールアドレスに対応
  slack_enabled BOOLEAN DEFAULT false,
  slack_webhook_url TEXT, -- 暗号化推奨
  line_enabled BOOLEAN DEFAULT false,
  line_notify_token TEXT, -- 暗号化推奨
  
  -- 通知頻度
  notification_frequency VARCHAR(50) DEFAULT 'daily', -- 'daily', 'weekly'
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, article_id) -- 記事ごとの設定
);

CREATE INDEX idx_notification_settings_user_id ON notification_settings(user_id);
CREATE INDEX idx_notification_settings_article_id ON notification_settings(article_id);
```

### 9. usage_stats（利用統計 - プラン制限管理用）

```sql
CREATE TABLE usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_type VARCHAR(50) NOT NULL, -- 'analyses_this_month', 'articles_registered'
  stat_value INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL, -- 集計期間の開始（例: 月初め）
  period_end TIMESTAMP WITH TIME ZONE NOT NULL, -- 集計期間の終了（例: 月末）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, stat_type, period_start)
);

CREATE INDEX idx_usage_stats_user_id ON usage_stats(user_id);
CREATE INDEX idx_usage_stats_period ON usage_stats(stat_type, period_start, period_end);
```

## データフロー設計

### 1. 試用フェーズ（Googleログイン + GSC連携）

```
ランディングページ → Googleログインボタン → OAuth認証 → GSCプロパティ選択 → 記事URL入力 → 即座に分析実行 → 結果表示
```

**フロー詳細**:

1. **Googleログイン（OAuth 2.0）**
   - 「Googleでログイン」ボタンをクリック
   - Googleアカウントで認証
   - **権限スコープ**: `https://www.googleapis.com/auth/webmasters.readonly`（読み取り専用）
   - 認証完了後、ユーザー情報を `users` テーブルに保存

2. **GSCプロパティ選択**
   - ユーザーが所有するGSCプロパティの一覧を表示
   - 選択したプロパティを `sites` テーブルに保存
   - OAuthトークン（アクセストークン・リフレッシュトークン）を暗号化して保存

3. **記事URL入力と分析**
   - 選択したプロパティのドメイン内の記事URLを入力
   - GSC APIから実際の順位データ（時系列）を取得
   - 競合分析を実行
   - 結果を即座に表示

4. **試用時のデータ保存**
   - 試用時は `articles` テーブルに保存しない（一時的な分析のみ）
   - 分析結果は一時ストレージに保存（24時間有効）
   - ユーザーが「記事を登録」を選択した場合のみ `articles` テーブルに保存

**メリット**:
- ✅ 実際のGSCデータを使用するため、信頼性が高い
- ✅ 時系列データで過去との比較が可能
- ✅ 順位下落の検知が正確
- ✅ ダミーデータではなく、実際のデータを表示
- ✅ Googleアカウントがあれば即座に試用可能（敷居が低い）

**GSC連携の懸念への対応**:
- 権限説明ページで「読み取り専用」であることを明示
- 「データは順位分析のみに使用し、他の用途には使用しません」と説明
- 連携解除ボタンを常に表示
- プライバシーポリシーでデータの取り扱いを明記

### 2. 定期実行フロー

```
Cron Job → 監視対象記事を取得 → GSC APIで順位取得 → 下落検知 → 分析実行 → 通知送信
```

1. **定期チェック（軽量）**
   - `articles` テーブルから `is_monitoring = true` の記事を取得
   - GSC APIで順位データのみ取得
   - 下落を検知した場合のみ詳細分析を実行

2. **詳細分析実行時**
   - `analysis_runs` にレコード作成（status: 'running'）
   - 競合分析を実行
   - 結果を `analysis_results` に保存（サマリー）
   - 詳細データは一時ストレージ（S3/Redis）に保存（30日間有効）
   - `analysis_runs` の status を 'completed' に更新

3. **通知送信時**
   - `notifications` にレコード作成
   - ダイジェストをメール/Slack/LINEで送信
   - 詳細レポートへのリンク（一時トークン付き）を含める

### 3. 詳細レポート閲覧フロー

```
通知リンク → トークン検証 → 一時ストレージから詳細データ取得 → 表示
```

- リンクは30日間有効
- 閲覧時に `notifications.read_at` を更新
- 詳細データが期限切れの場合は再分析を実行（オプション）

## ストレージ戦略（詳細設計）

### データの分類と保存先

#### 1. **DBに保存するもの（永続保存）**

**目的**: 通知・一覧表示・検索に必要な軽量データのみ

| データ | 保存先テーブル | 内容 | サイズ目安 |
|--------|--------------|------|-----------|
| **順位情報** | `analysis_results` | 平均順位、前回順位、変化量 | 数値のみ（数KB） |
| **キーワードサマリー** | `analysis_results` | 分析対象キーワード、下落キーワード（上位5個）、上位キーワード（上位5個） | JSONB（数KB） |
| **改善案サマリー** | `analysis_results` | 追加すべき項目のリスト（箇条書き）、不足内容の要約 | TEXT/JSONB（10-50KB） |
| **通知用ダイジェスト** | `notifications` | 通知のサマリー、件名 | TEXT（数KB） |
| **記事メタデータ** | `articles` | URL、タイトル、現在の平均順位 | 文字列のみ（数KB） |
| **実行履歴** | `analysis_runs` | 実行日時、ステータス、エラー情報 | メタデータのみ（数KB） |

**特徴**:
- クエリが高速（インデックス活用）
- 通知・一覧表示に最適化
- 永続保存で履歴を追跡可能

#### 2. **一時ストレージに保存するもの（30日間有効）**

**目的**: 詳細レポート表示用の重いデータ

| データ | 保存形式 | 内容 | サイズ目安 | 再生成可否 |
|--------|---------|------|-----------|----------|
| **自社記事の全文** | JSON | ArticleContent（見出し、段落、リスト、全文） | 50-200KB | ❌ 再生成不可（記事が更新される可能性） |
| **競合記事の全文** | JSON | 競合記事のArticleContent（複数） | 200KB-2MB | ✅ 再生成可能（Serper APIで再取得） |
| **詳細なLLM分析結果** | JSON | LLMDiffAnalysisResult（意味レベルの分析、詳細な推奨事項） | 10-50KB | ✅ 再生成可能（LLM APIで再分析） |
| **基本的な差分分析** | JSON | DiffAnalysisResult（見出し差分、キーワード差分、文字数差分） | 10-30KB | ✅ 再生成可能（記事コンテンツから再計算） |
| **時系列データ** | JSON | キーワードごとの時系列データ（グラフ用） | 5-20KB | ✅ 再生成可能（GSC APIで再取得） |
| **競合URL一覧** | JSON | 分析した競合サイトのURLリスト | 数KB | ✅ 再生成可能（Serper APIで再取得） |

**特徴**:
- ファイルサイズが大きい（合計で数MBになる可能性）
- 詳細レポート表示時のみ必要
- 期限切れ後は再生成可能（一部を除く）

**推奨ストレージ**:
- **Vercel Blob Storage**: 簡単に始められる、Next.jsとの統合が容易
- **AWS S3**: スケーラブル、コスト効率が良い
- **Redis**: 高速アクセスが必要な場合（ただし容量制限あり）

### ユーザーアクセス方法

#### 1. **通知（メール/Slack/LINE）**

**表示内容**: ダイジェストのみ（DBから取得）

```
【ReRank AI】順位下落を検知しました

記事: https://example.com/article
順位: 4.1位 → 6.7位（2.6位下落）

原因: 「価格」「月額」などのキーワードが10位前後に転落

改善案（上位3個）:
- 「価格比較表」が欠けている
- 「デメリット解消法」が欠けている
- 「選定基準の比較」が欠けている

詳細レポートを見る: [リンク]
```

**データ取得元**: `notifications` テーブル（`summary` カラム）

#### 2. **ダッシュボード（一覧画面）**

**表示内容**: 記事一覧とサマリー（DBから取得）

```
記事一覧:
- 記事A: 現在4.1位（前回3.5位、+0.6位）[詳細を見る]
- 記事B: 現在8.2位（前回8.0位、+0.2位）[詳細を見る]
- 記事C: 現在12.5位（前回10.1位、+2.4位）⚠️ [詳細を見る]
```

**データ取得元**: 
- `articles` テーブル（現在の平均順位）
- `analysis_results` テーブル（最新の分析結果のサマリー）

**クエリ例**:
```sql
SELECT 
  a.url,
  a.title,
  a.current_average_position,
  ar.previous_average_position,
  ar.position_change,
  ar.recommended_additions,
  ar.created_at
FROM articles a
LEFT JOIN LATERAL (
  SELECT * FROM analysis_results 
  WHERE article_id = a.id 
  ORDER BY created_at DESC 
  LIMIT 1
) ar ON true
WHERE a.user_id = $1 AND a.deleted_at IS NULL
ORDER BY ar.created_at DESC;
```

#### 3. **詳細レポート（個別記事の分析結果）**

**表示内容**: 完全な分析結果（一時ストレージから取得）

**アクセス方法**:
1. **通知からのリンク**: 一時トークン付きURL（30日間有効）
   ```
   https://app.rerank.ai/reports/{analysis_result_id}?token={jwt_token}
   ```
2. **ダッシュボードからのリンク**: ログイン済みユーザーは直接アクセス
   ```
   https://app.rerank.ai/reports/{analysis_result_id}
   ```

**データ取得フロー**:
```typescript
async function getDetailedReport(analysisResultId: string, userId: string) {
  // 1. DBからサマリーを取得（認証チェック）
  const summary = await db.analysis_results.findFirst({
    where: { 
      id: analysisResultId,
      article: { user_id: userId } // ユーザー所有チェック
    },
    include: { article: true }
  });
  
  if (!summary) throw new Error('Not found');
  
  // 2. 一時ストレージから詳細データを取得
  if (summary.detailed_result_storage_key) {
    const detailedData = await blobStorage.get(
      summary.detailed_result_storage_key
    );
    
    if (detailedData) {
      return {
        summary, // DBのサマリー
        detailed: detailedData // 一時ストレージの詳細データ
      };
    }
  }
  
  // 3. 詳細データが期限切れの場合、再生成（オプション）
  // 注意: 自社記事の全文は再生成不可のため、一部データが欠ける可能性
  throw new Error('Detailed data expired');
}
```

**表示内容の例**:
- 順位情報（グラフ表示）
- キーワードごとの分析（時系列グラフ）
- 競合記事との詳細な差分
- LLMによる意味レベルの分析
- 具体的な改善案（箇条書き + 競合URLへのリンク）
- 競合記事の全文（折りたたみ可能）

#### 4. **データの再生成戦略**

**期限切れ時の対応**:

| データ | 再生成可否 | 再生成方法 | 注意点 |
|--------|----------|----------|--------|
| 自社記事の全文 | ❌ 不可 | - | 記事が更新されている可能性があるため、再生成は推奨しない |
| 競合記事の全文 | ✅ 可能 | Serper APIで再取得 → スクレイピング | コストがかかる（API呼び出し） |
| LLM分析結果 | ✅ 可能 | 記事コンテンツから再分析 | コストがかかる（LLM API呼び出し） |
| 時系列データ | ✅ 可能 | GSC APIで再取得 | 無料（GSC API） |
| 基本的な差分分析 | ✅ 可能 | 記事コンテンツから再計算 | 無料（計算のみ） |

**再生成の実装**:
```typescript
async function regenerateDetailedData(
  analysisResultId: string,
  regenerateOptions: {
    regenerateCompetitors?: boolean;
    regenerateLLMAnalysis?: boolean;
    regenerateTimeSeries?: boolean;
  }
) {
  const summary = await db.analysis_results.findUnique({
    where: { id: analysisResultId },
    include: { article: true }
  });
  
  // 自社記事の全文は再取得不可（期限切れの場合はエラー）
  // 競合記事、LLM分析、時系列データのみ再生成可能
  
  const detailedData: any = {};
  
  if (regenerateOptions.regenerateCompetitors) {
    // 競合記事を再取得
    detailedData.competitorArticles = await fetchCompetitorArticles(...);
  }
  
  if (regenerateOptions.regenerateLLMAnalysis) {
    // LLM分析を再実行
    detailedData.semanticAnalysis = await runLLMAnalysis(...);
  }
  
  if (regenerateOptions.regenerateTimeSeries) {
    // 時系列データを再取得
    detailedData.timeSeries = await fetchTimeSeriesFromGSC(...);
  }
  
  // 一時ストレージに再保存（30日間有効）
  const storageKey = await blobStorage.put(
    `analysis/${analysisResultId}/detailed.json`,
    detailedData,
    { expiresIn: 30 * 24 * 60 * 60 } // 30日
  );
  
  // DBの参照を更新
  await db.analysis_results.update({
    where: { id: analysisResultId },
    data: {
      detailed_result_storage_key: storageKey,
      detailed_result_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
}
```

### データ保存のタイミング

#### 分析実行時

```typescript
async function saveAnalysisResult(
  articleId: string,
  analysisResult: CompetitorAnalysisSummary
) {
  // 1. サマリーをDBに保存
  const summary = await db.analysis_results.create({
    data: {
      article_id: articleId,
      average_position: analysisResult.prioritizedKeywords[0]?.position,
      analyzed_keywords: analysisResult.prioritizedKeywords.map(k => k.keyword),
      dropped_keywords: analysisResult.prioritizedKeywords
        .filter(k => k.position >= 10)
        .slice(0, 5)
        .map(k => ({
          keyword: k.keyword,
          position: k.position,
          impressions: k.impressions
        })),
      recommended_additions: analysisResult.semanticDiffAnalysis
        ?.semanticAnalysis.recommendedAdditions.slice(0, 10) || [],
      missing_content_summary: analysisResult.semanticDiffAnalysis
        ?.semanticAnalysis.missingContent.slice(0, 5).join(', ') || null
    }
  });
  
  // 2. 詳細データを一時ストレージに保存
  const detailedData = {
    ownArticle: analysisResult.diffAnalysis?.ownArticle,
    competitorArticles: analysisResult.diffAnalysis?.competitorArticles,
    semanticAnalysis: analysisResult.semanticDiffAnalysis,
    keywordTimeSeries: analysisResult.keywordTimeSeries,
    competitorUrls: analysisResult.uniqueCompetitorUrls
  };
  
  const storageKey = await blobStorage.put(
    `analysis/${summary.id}/detailed.json`,
    detailedData,
    { expiresIn: 30 * 24 * 60 * 60 } // 30日
  );
  
  // 3. DBの参照を更新
  await db.analysis_results.update({
    where: { id: summary.id },
    data: {
      detailed_result_storage_key: storageKey,
      detailed_result_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  
  return summary;
}
```

### コスト最適化

#### 1. **DBの容量削減**
- サマリーのみ保存（数KB）
- 詳細データは一時ストレージ（数MB）に分離
- 古い分析結果は定期的にアーカイブ

#### 2. **一時ストレージのコスト削減**
- 30日間の有効期限で自動削除
- アクセス頻度の低いデータは期限切れ後に再生成
- 圧縮（gzip）で容量削減

#### 3. **再生成のコスト管理**
- ユーザーが明示的に「再生成」を選択した場合のみ実行
- 期限切れの詳細データは「一部データが期限切れです」と表示し、必要に応じて再生成を促す

## プラン制限の実装

### 1. 記事登録数の制限

```typescript
async function canRegisterArticle(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  const plan = await getPlan(user.plan_id);
  const currentCount = await getArticleCount(userId);
  
  if (plan.max_articles === null) return true; // 無制限
  return currentCount < plan.max_articles;
}
```

### 2. 月間分析回数の制限

```typescript
async function canRunAnalysis(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  const plan = await getPlan(user.plan_id);
  
  if (plan.max_analyses_per_month === null) return true; // 無制限
  
  const currentMonth = new Date();
  const usage = await getUsageStats(
    userId, 
    'analyses_this_month', 
    startOfMonth(currentMonth),
    endOfMonth(currentMonth)
  );
  
  return usage.stat_value < plan.max_analyses_per_month;
}
```

## 検討すべき追加事項

### 1. データ保持期間
- **分析結果**: 90日間保持（その後アーカイブまたは削除）
- **通知履歴**: 1年間保持
- **詳細データ**: 30日間保持（その後自動削除）

### 2. パフォーマンス最適化
- `articles` テーブルに `current_average_position` をキャッシュ
- 定期チェック時はGSC APIのみ呼び出し、詳細分析は必要時のみ
- 分析結果の集計クエリ用にマテリアライズドビューを検討

### 3. セキュリティ
- **OAuthトークンの暗号化**: AES-256で暗号化して保存（必須）
- **権限の最小化**: GSC APIは読み取り専用スコープ（`webmasters.readonly`）のみ
- **トークンの有効期限管理**: 期限切れ前に自動リフレッシュ
- **詳細レポートへのリンク**: 一時トークン（JWT）を使用（30日間有効）
- **ユーザー間のデータ分離**: 徹底的なアクセス制御
- **連携解除**: ユーザーがいつでも簡単に連携解除可能
- **監査ログ**: トークンアクセスのログを保存（セキュリティ監査用）

### 4. 監査ログ
- 重要な操作（プラン変更、記事削除など）のログを保存
- 分析実行の履歴を保持（デバッグ・サポート用）

### 5. スケーラビリティ
- 大量の定期実行を処理するためのキューシステム（Bull/BullMQ）
- 分析実行の並列処理制限（プラン別）
- データベースのパーティショニング（日付ベース）

## GSC連携の実装方針

### 1. OAuth認証フロー（既に実装済み）

現在の実装（`lib/auth.ts`）を活用：
- NextAuth.jsでGoogle OAuth認証
- スコープ: `https://www.googleapis.com/auth/webmasters.readonly`（読み取り専用）
- アクセストークン・リフレッシュトークンを取得

### 2. GSCプロパティの取得と選択

```typescript
// GSC APIでユーザーが所有するプロパティ一覧を取得
async function getGSCProperties(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  return response.json();
}
```

### 3. 権限説明ページの実装

試用開始前に表示する内容：
- **権限の種類**: 「Search Console データの閲覧」（読み取り専用）
- **使用目的**: 「記事の順位データを取得し、順位下落を検知するため」
- **データの取り扱い**: 「順位分析のみに使用し、他の用途には使用しません」
- **連携解除**: 「いつでも設定画面から連携解除できます」
- **プライバシー**: プライバシーポリシーへのリンク

### 4. トークンの暗号化保存

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32バイトのキー
const ALGORITHM = 'aes-256-gcm';

function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptToken(encryptedToken: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedToken.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 5. 連携解除機能

```typescript
async function disconnectGSC(userId: string, siteId: string) {
  // 1. トークンを削除（DBから削除）
  await db.sites.update({
    where: { id: siteId, user_id: userId },
    data: {
      gsc_access_token: null,
      gsc_refresh_token: null,
      gsc_token_expires_at: null,
      is_active: false
    }
  });
  
  // 2. 関連する記事の監視を停止
  await db.articles.updateMany({
    where: { site_id: siteId },
    data: { is_monitoring: false }
  });
  
  // 3. Google側の権限も解除（オプション）
  // 注意: Google側の権限解除は、ユーザーがGoogleアカウント設定から行う必要がある
}
```

## マイグレーション戦略

### Phase 1: 基本テーブル作成
1. users, plans, sites, articles
2. 認証機能の実装（既に実装済み）
3. GSCプロパティ選択機能の実装

### Phase 2: 分析機能の統合
1. analysis_runs, analysis_results
2. 既存の分析ロジックをDBと連携
3. GSC APIからの実際の順位データ取得

### Phase 3: 通知機能の統合
1. notifications, notification_settings
2. 既存の通知機能をDBと連携
3. 順位下落検知と自動通知

### Phase 4: 最適化
1. usage_stats（プラン制限管理）
2. インデックス最適化
3. 一時ストレージの統合
4. トークン暗号化の実装

## ダッシュボード設計

### 必要な機能

ユーザーが自分の記事を管理し、分析結果を確認するためのダッシュボードが必要です。

#### 1. **メインダッシュボード（`/dashboard`）**

**表示内容**:
- 記事一覧（登録済み記事のサマリー）
- 最近の分析結果
- 順位下落アラート（未読通知）
- プラン情報と利用状況

**レイアウト例**:
```
┌─────────────────────────────────────────┐
│  ReRank AI ダッシュボード                │
├─────────────────────────────────────────┤
│ [記事を追加] [設定] [プラン変更]          │
├─────────────────────────────────────────┤
│ 📊 利用状況                                │
│   今月の分析回数: 5/20回                  │
│   登録記事数: 3/20件                      │
├─────────────────────────────────────────┤
│ ⚠️ アラート（2件）                        │
│   • 記事A: 順位下落検知（未読）            │
│   • 記事B: 順位下落検知（未読）            │
├─────────────────────────────────────────┤
│ 📝 記事一覧                               │
│   • 記事A: 4.1位（前回3.5位、+0.6位）      │
│     [詳細] [通知設定] [削除]               │
│   • 記事B: 8.2位（前回8.0位、+0.2位）      │
│     [詳細] [通知設定] [削除]               │
│   • 記事C: 12.5位（前回10.1位、+2.4位）⚠️  │
│     [詳細] [通知設定] [削除]               │
└─────────────────────────────────────────┘
```

**データ取得**:
```typescript
// ダッシュボード用のデータ取得
async function getDashboardData(userId: string) {
  // 1. 利用状況
  const usage = await getUsageStats(userId);
  
  // 2. 未読通知
  const unreadNotifications = await db.notifications.findMany({
    where: {
      user_id: userId,
      read_at: null,
      notification_type: 'rank_drop'
    },
    orderBy: { created_at: 'desc' },
    take: 5,
    include: {
      article: { select: { url: true, title: true } }
    }
  });
  
  // 3. 記事一覧（最新の分析結果を含む）
  const articles = await db.articles.findMany({
    where: {
      user_id: userId,
      deleted_at: null
    },
    include: {
      site: { select: { display_name: true } },
      latestAnalysis: {
        select: {
          average_position: true,
          previous_average_position: true,
          position_change: true,
          created_at: true
        },
        orderBy: { created_at: 'desc' },
        take: 1
      }
    },
    orderBy: { updated_at: 'desc' }
  });
  
  return { usage, unreadNotifications, articles };
}
```

#### 2. **記事詳細ページ（`/dashboard/articles/[id]`）**

**表示内容**:
- 記事の基本情報（URL、タイトル、登録日時）
- 分析結果の履歴（時系列）
- 最新の分析結果（サマリー）
- 詳細レポートへのリンク
- 通知設定
- 監視設定（定期実行のON/OFF）

**レイアウト例**:
```
┌─────────────────────────────────────────┐
│  ← ダッシュボードに戻る                   │
├─────────────────────────────────────────┤
│ 📄 記事: https://example.com/article     │
│    タイトル: ポケトモ レビュー             │
│    登録日: 2025/01/15                    │
├─────────────────────────────────────────┤
│ 📊 順位推移（グラフ）                     │
│    [時系列グラフ表示]                     │
├─────────────────────────────────────────┤
│ 📈 最新の分析結果（2025/01/20）           │
│    現在の順位: 4.1位（前回3.5位、+0.6位） │
│    分析対象キーワード: 3個                │
│    改善案: 5個                           │
│    [詳細レポートを見る]                   │
├─────────────────────────────────────────┤
│ 📋 分析履歴                               │
│    • 2025/01/20: 順位下落検知             │
│    • 2025/01/15: 手動分析                 │
│    • 2025/01/10: 定期チェック             │
├─────────────────────────────────────────┤
│ ⚙️ 設定                                   │
│    [ ] 定期監視を有効にする                │
│    監視頻度: [毎日 ▼]                     │
│    [通知設定を変更]                       │
└─────────────────────────────────────────┘
```

#### 3. **分析結果詳細ページ（`/dashboard/reports/[id]`）**

**表示内容**:
- 完全な分析結果（一時ストレージから取得）
- 順位情報（グラフ）
- キーワードごとの分析
- 競合記事との詳細な差分
- LLMによる意味レベルの分析
- 具体的な改善案

**データ取得**:
```typescript
// 詳細レポートの取得（既に設計済み）
async function getDetailedReport(analysisResultId: string, userId: string) {
  // ... 既存の実装を参照
}
```

#### 4. **設定ページ（`/dashboard/settings`）**

**表示内容**:
- GSC連携設定（プロパティ一覧、連携解除）
- 通知設定（メール、Slack、LINE）
- プラン情報と変更
- アカウント情報

**レイアウト例**:
```
┌─────────────────────────────────────────┐
│  ⚙️ 設定                                 │
├─────────────────────────────────────────┤
│ 🔗 GSC連携                                │
│   連携済みサイト:                         │
│   • example.com [連携解除]                │
│   [新しいサイトを連携]                     │
├─────────────────────────────────────────┤
│ 📧 通知設定                               │
│   メール通知: [ON/OFF]                    │
│   通知先: user@example.com                │
│   [追加]                                  │
│   Slack通知: [ON/OFF]                     │
│   [Webhook URLを設定]                    │
├─────────────────────────────────────────┤
│ 💳 プラン情報                             │
│   現在のプラン: スターター（2,980円/月）   │
│   今月の利用状況: 5/20回                  │
│   [プランを変更]                          │
├─────────────────────────────────────────┤
│ 👤 アカウント情報                         │
│   メール: user@example.com                │
│   名前: ユーザー名                        │
│   [ログアウト]                            │
└─────────────────────────────────────────┘
```

### 認証フローの実装

#### 1. **ログイン時のDB連携**

**設計方針**: Googleアカウントでログイン = GSC API取得に必要なアカウントと同じ

**メリット**:
- シンプル: 1つのアカウントで完結
- ユーザー体験: ログインと同時にGSC連携の準備が整う
- セキュリティ: Googleの認証システムを活用

**実装例**:

```typescript
// lib/auth.ts の callbacks を拡張
import { db } from '@/lib/db'; // DB接続（Prisma等）

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user, trigger }) {
      // 初回ログイン時にアクセストークンを保存
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000;
        
        // DBにユーザー情報を保存/更新
        if (user?.email) {
          const dbUser = await upsertUser({
            email: user.email,
            name: user.name || null,
            provider: 'google',
            provider_id: user.id,
          });
          
          // セッションにユーザーIDを追加
          token.userId = dbUser.id;
        }
      }
      
      // ... 既存のトークンリフレッシュロジック
      return token;
    },
    async session({ session, token }) {
      // セッションにアクセストークンとユーザーIDを追加
      if (token) {
        session.accessToken = token.accessToken as string;
        session.userId = token.userId as string;
      }
      return session;
    },
  },
});

async function upsertUser(data: {
  email: string;
  name?: string | null;
  provider: string;
  provider_id: string;
}) {
  // デフォルトプラン（無料プラン）を取得
  const freePlan = await db.plans.findFirst({
    where: { name: 'free' }
  });
  
  // users テーブルに保存/更新
  const user = await db.users.upsert({
    where: { email: data.email },
    update: {
      name: data.name,
      updated_at: new Date()
    },
    create: {
      email: data.email,
      name: data.name,
      provider: data.provider,
      provider_id: data.provider_id,
      plan_id: freePlan?.id,
      plan_started_at: new Date()
    }
  });
  
  return user;
}
```

#### 2. **GSCプロパティ選択フロー**

**フロー**:
1. ユーザーがログイン（Googleアカウント）
2. ダッシュボードで「GSCサイトを連携」をクリック
3. GSC APIでユーザーが所有するプロパティ一覧を取得
4. ユーザーがプロパティを選択
5. 選択したプロパティを `sites` テーブルに保存（トークンも暗号化して保存）

**実装例**:

```typescript
// app/api/gsc/properties/route.ts
import { auth } from '@/lib/auth';
import { getGSCClient } from '@/lib/gsc-api';

export async function GET(request: Request) {
  const session = await auth();
  
  if (!session?.accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // GSC APIでプロパティ一覧を取得
  const client = getGSCClient(session.accessToken);
  const properties = await client.getSites();
  
  return Response.json({ properties });
}

// app/api/gsc/connect/route.ts
import { auth } from '@/lib/auth';
import { encryptToken } from '@/lib/encryption';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const session = await auth();
  
  if (!session?.userId || !session?.accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { siteUrl } = await request.json();
  
  // トークンを暗号化
  const encryptedAccessToken = encryptToken(session.accessToken);
  const encryptedRefreshToken = encryptToken(session.refreshToken || '');
  
  // sites テーブルに保存
  const site = await db.sites.upsert({
    where: {
      user_id: session.userId,
      site_url: siteUrl
    },
    update: {
      gsc_access_token: encryptedAccessToken,
      gsc_refresh_token: encryptedRefreshToken,
      gsc_token_expires_at: new Date(Date.now() + 3600 * 1000), // 1時間後
      is_active: true,
      updated_at: new Date()
    },
    create: {
      user_id: session.userId,
      site_url: siteUrl,
      display_name: extractDomain(siteUrl),
      gsc_access_token: encryptedAccessToken,
      gsc_refresh_token: encryptedRefreshToken,
      gsc_token_expires_at: new Date(Date.now() + 3600 * 1000),
      is_active: true
    }
  });
  
  return Response.json({ site });
}
```

#### 2. **GSCプロパティ選択時の処理**

```typescript
// GSCプロパティ選択後、sites テーブルに保存
async function connectGSCProperty(
  userId: string,
  siteUrl: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
) {
  // トークンを暗号化
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken);
  
  // sites テーブルに保存
  const site = await db.sites.upsert({
    where: {
      user_id: userId,
      site_url: siteUrl
    },
    update: {
      gsc_access_token: encryptedAccessToken,
      gsc_refresh_token: encryptedRefreshToken,
      gsc_token_expires_at: expiresAt,
      is_active: true,
      updated_at: new Date()
    },
    create: {
      user_id: userId,
      site_url: siteUrl,
      display_name: extractDomain(siteUrl),
      gsc_access_token: encryptedAccessToken,
      gsc_refresh_token: encryptedRefreshToken,
      gsc_token_expires_at: expiresAt,
      is_active: true
    }
  });
  
  return site;
}
```

### ページ構成

```
app/
├── page.tsx                    # ランディングページ（未ログイン時）
├── dashboard/
│   ├── page.tsx               # メインダッシュボード
│   ├── articles/
│   │   ├── page.tsx           # 記事一覧
│   │   └── [id]/
│   │       └── page.tsx       # 記事詳細
│   ├── reports/
│   │   └── [id]/
│   │       └── page.tsx       # 分析結果詳細
│   └── settings/
│       └── page.tsx           # 設定ページ
└── api/
    ├── auth/[...nextauth]/
    │   └── route.ts           # 認証（既存）
    ├── dashboard/
    │   └── route.ts           # ダッシュボードデータ取得
    └── articles/
        ├── route.ts            # 記事一覧取得
        └── [id]/
            └── route.ts        # 記事詳細取得
```

### 実装の優先順位

1. **Phase 1: 基本認証とDB連携**
   - NextAuth.jsのコールバックでDBにユーザー情報を保存
   - ログイン状態の確認

2. **Phase 2: メインダッシュボード**
   - 記事一覧の表示
   - 利用状況の表示
   - 未読通知の表示

3. **Phase 3: 記事管理機能**
   - 記事の追加
   - 記事詳細ページ
   - 記事の削除

4. **Phase 4: 分析結果の表示**
   - 分析結果詳細ページ
   - 詳細レポートの表示

5. **Phase 5: 設定機能**
   - GSC連携設定
   - 通知設定
   - プラン管理

## スケーラビリティとパフォーマンス最適化

### 1. インデックス設計の最適化

#### 追加推奨インデックス（複合インデックス・部分インデックス）

```sql
-- articles テーブル: 定期チェック用（最重要）
CREATE INDEX idx_articles_monitoring_check ON articles(is_monitoring, last_analyzed_at, site_id) 
  WHERE is_monitoring = true AND deleted_at IS NULL;

-- analysis_results テーブル: 記事別の最新分析結果取得用
CREATE INDEX idx_analysis_results_article_created ON analysis_results(article_id, created_at DESC);

-- notifications テーブル: 未読通知取得用
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC) 
  WHERE read_at IS NULL;
```

### 2. パーティショニング戦略（将来の拡張）

大量の分析結果は日付ベースでパーティショニング：

```sql
-- analysis_results テーブルのパーティショニング（PostgreSQL 10+）
CREATE TABLE analysis_results (
  -- ... カラム定義
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 月次パーティションを作成（自動化推奨）
CREATE TABLE analysis_results_2025_01 PARTITION OF analysis_results
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 3. データアーカイブ戦略

```sql
-- 90日以上前の分析結果をアーカイブ
CREATE TABLE analysis_results_archive (LIKE analysis_results INCLUDING ALL);

CREATE OR REPLACE FUNCTION archive_old_analysis_results()
RETURNS void AS $$
BEGIN
  INSERT INTO analysis_results_archive
  SELECT * FROM analysis_results
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  DELETE FROM analysis_results
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```

### 4. 同時実行制御

```sql
-- 分析実行の重複防止（楽観的ロック）
ALTER TABLE analysis_runs
ADD CONSTRAINT unique_article_running 
UNIQUE (article_id, status) 
WHERE status IN ('pending', 'running');

-- プラン制限のチェック（バージョン管理）
ALTER TABLE usage_stats ADD COLUMN version INTEGER DEFAULT 0;
```

### 5. レート制限

```sql
-- レート制限用テーブル
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, action_type, window_start)
);
```

### 6. クエリ最適化

#### よく使うクエリの最適化例

```sql
-- ダッシュボード用の記事一覧（LATERAL JOIN使用）
SELECT 
  a.id, a.url, a.title, a.current_average_position,
  ar.previous_average_position, ar.position_change, ar.recommended_additions
FROM articles a
LEFT JOIN LATERAL (
  SELECT previous_average_position, position_change, recommended_additions, created_at
  FROM analysis_results 
  WHERE article_id = a.id 
  ORDER BY created_at DESC 
  LIMIT 1
) ar ON true
WHERE a.user_id = $1 AND a.deleted_at IS NULL
ORDER BY ar.created_at DESC NULLS LAST
LIMIT 50;
```

### 7. キャッシュ戦略（オプション）

```typescript
// Redis キャッシュ（よくアクセスされるデータ）
const cacheKey = `user:${userId}:dashboard`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const data = await getDashboardData(userId);
await redis.setex(cacheKey, 300, JSON.stringify(data)); // 5分間キャッシュ
return data;
```

**キャッシュ対象**:
- ダッシュボードの記事一覧（5分間）
- プラン情報（1時間）
- 利用統計（1時間）

### 8. 監視・ログ

```sql
-- スロークエリの監視（postgresql.conf）
log_min_duration_statement = 1000; -- 1秒以上

-- テーブルサイズの確認
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;
```

### 9. バックアップ・リカバリ

**Vercel Postgres / Supabase**: 自動バックアップが提供される。

手動バックアップ（オプション）:
```bash
pg_dump -h localhost -U postgres -d rerank_ai -F c -f backup_$(date +%Y%m%d).dump
```

### 10. データ整合性

#### トランザクション管理

```typescript
// 分析実行時のトランザクション
await db.$transaction(async (tx) => {
  const run = await tx.analysis_runs.create({...});
  const result = await analyzeArticle(...);
  await tx.analysis_results.create({...});
  await tx.articles.update({...});
  await tx.usage_stats.upsert({...});
});
```

### 11. パフォーマンステスト指標

- **同時ユーザー数**: 100, 500, 1000ユーザーでテスト
- **クエリ応答時間**: 95パーセンタイル < 500ms
- **分析実行時間**: 平均30秒以内
- **DB接続数**: 最大100接続

### 12. 将来の拡張性

#### シャーディング（10万ユーザー以上の場合）

```typescript
// ユーザーIDのハッシュでデータベースを分割
const shardId = hashUserId(userId) % numShards;
const db = getShardConnection(shardId);
```

**現時点では不要**: 10万ユーザーまでは単一データベースで対応可能。

## まとめ: スケーラビリティ対策の優先順位

### MVP段階（必須）
1. ✅ 基本的なインデックス設計
2. ✅ 外部キー制約
3. ✅ トランザクション管理

### 成長段階（100-1000ユーザー）
1. ✅ 複合インデックスの追加
2. ✅ クエリ最適化
3. ✅ データアーカイブ
4. ✅ レート制限

### スケール段階（1000-10000ユーザー）
1. ✅ パーティショニング
2. ✅ 読み取りレプリカ
3. ✅ キャッシュ戦略
4. ✅ 接続プール最適化

### 大規模段階（10000ユーザー以上）
1. ✅ シャーディング
2. ✅ マイクロサービス化
3. ✅ CDN活用

