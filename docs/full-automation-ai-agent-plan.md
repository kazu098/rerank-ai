# 全自動化AIエージェント実装計画

## ビジョン

**サイトを登録するだけで、あとは完全自動で記事改善を行うAIエージェント**

- 記事単位の登録は不要
- GSCデータから注力すべき記事を自動ピックアップ
- 常時監視と自動分析
- 自動で記事修正（WordPress API等と連携）
- ユーザーは承認・確認のみ

---

## システムアーキテクチャ

### 全体フロー

```
1. サイト登録（Google Search Console連携）
   ↓
2. 自動記事発見（GSCデータから記事URLを自動抽出）
   ↓
3. 記事優先度スコアリング（インプレッション、クリック数、順位などから計算）
   ↓
4. 優先度の高い記事を自動監視対象に追加
   ↓
5. 定期監視（順位変動、インプレッション変動をチェック）
   ↓
6. 改善が必要な記事を自動検知
   ↓
7. 自動競合分析
   ↓
8. 自動改善案生成
   ↓
9. 改善案の品質評価
   ↓
10. 自動記事修正（WordPress API等を使用）
    ↓
11. 修正結果の通知・レポート
```

---

## Phase 1: 自動記事発見と優先度スコアリング

### 1.1 自動記事発見機能

**概要**: GSCデータからサイト内の全記事URLを自動抽出し、データベースに登録

**実装内容**:

1. **GSC APIから記事URL一覧を取得**
   ```typescript
   // lib/auto-article-discovery.ts
   async function discoverArticlesFromGSC(
     siteUrl: string,
     startDate: string,
     endDate: string
   ): Promise<ArticleDiscoveryResult[]> {
     // GSC APIでページ単位のデータを取得
     // 各ページのURL、インプレッション、クリック数、平均順位を取得
   }
   ```

2. **記事を自動登録**
   - 既存の`articles`テーブルに自動登録
   - `auto_discovered: true`フラグを追加
   - 初回発見時のみ登録、既存記事は更新

3. **定期実行**
   - 週1回、サイトごとに記事発見を実行
   - `/api/cron/discover-articles` cron jobを作成

**データベーススキーマ拡張**:
```sql
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_score DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS last_discovered_at TIMESTAMP WITH TIME ZONE;
```

### 1.2 記事優先度スコアリング

**概要**: インプレッション数、クリック数、順位、CTRなどから優先度スコアを計算

**スコア計算式**:

```typescript
interface ArticlePriorityScore {
  totalScore: number; // 0-1000点
  impressionsScore: number; // インプレッション数（最大400点）
  clicksScore: number; // クリック数（最大300点）
  positionScore: number; // 順位（最大200点）
  ctrScore: number; // CTR（最大100点）
  trendScore: number; // トレンド（上昇/下降、最大100点）
}

function calculatePriorityScore(articleData: GSCArticleData): ArticlePriorityScore {
  // インプレッション数スコア（最大400点）
  // 1000インプレッション以上 = 400点
  // 500インプレッション = 200点
  // 100インプレッション = 40点
  const impressionsScore = Math.min(400, (articleData.impressions / 1000) * 400);
  
  // クリック数スコア（最大300点）
  // 100クリック以上 = 300点
  // 50クリック = 150点
  // 10クリック = 30点
  const clicksScore = Math.min(300, (articleData.clicks / 100) * 300);
  
  // 順位スコア（最大200点）
  // 1-3位 = 200点
  // 4-10位 = 150点
  // 11-20位 = 100点
  // 21-30位 = 50点
  // 31位以下 = 0点
  const positionScore = articleData.position <= 3 ? 200
    : articleData.position <= 10 ? 150
    : articleData.position <= 20 ? 100
    : articleData.position <= 30 ? 50
    : 0;
  
  // CTRスコア（最大100点）
  // CTR 5%以上 = 100点
  // CTR 3% = 60点
  // CTR 1% = 20点
  const ctrScore = Math.min(100, articleData.ctr * 20 * 100);
  
  // トレンドスコア（最大100点）
  // 順位が上昇傾向 = +100点
  // 順位が下降傾向 = -50点
  // 変化なし = 0点
  const trendScore = calculateTrendScore(articleData.positionHistory);
  
  return {
    totalScore: impressionsScore + clicksScore + positionScore + ctrScore + trendScore,
    impressionsScore,
    clicksScore,
    positionScore,
    ctrScore,
    trendScore,
  };
}
```

**優先度に基づく監視対象の選定**:

- **高優先度（800点以上）**: 毎日監視
- **中優先度（500-799点）**: 週3回監視
- **低優先度（200-499点）**: 週1回監視
- **最低優先度（200点未満）**: 監視対象外（または月1回）

**実装**:
- `/api/cron/calculate-priority-scores` cron job
- 週1回、全記事の優先度スコアを再計算
- 優先度に応じて`monitoring_frequency`を自動更新

---

## Phase 2: 自動監視と改善検知

### 2.1 拡張された監視システム

**既存の`/api/cron/check-rank`を拡張**:

1. **優先度に基づく監視頻度の適用**
   - 高優先度記事: 毎日チェック
   - 中優先度記事: 週3回チェック
   - 低優先度記事: 週1回チェック

2. **改善が必要な記事の自動検知**
   - 順位下落（既存機能）
   - インプレッション数減少
   - クリック数減少
   - CTR低下
   - 競合の順位上昇

### 2.2 自動競合分析トリガー

**改善が必要な記事を検知したら自動で競合分析を実行**:

```typescript
// app/api/cron/auto-analyze-articles/route.ts
async function autoAnalyzeArticles() {
  // 1. 改善が必要な記事を取得
  const articlesNeedingImprovement = await getArticlesNeedingImprovement();
  
  for (const article of articlesNeedingImprovement) {
    // 2. 競合分析を自動実行
    const analysisResult = await runCompetitorAnalysis(article);
    
    // 3. 分析結果を保存
    await saveAnalysisResult(article.id, analysisResult);
    
    // 4. 改善案生成ジョブをキューに追加
    await queueImprovementGeneration(article.id, analysisResult.id);
  }
}
```

**実行条件**:
- 順位が3位以上下落した場合
- インプレッション数が20%以上減少した場合
- クリック数が30%以上減少した場合
- 最後の分析から30日以上経過している場合

---

## Phase 3: 自動改善案生成と品質評価

### 3.1 自動改善案生成

**既存の`ArticleImprovementGenerator`を活用**:

```typescript
// app/api/cron/generate-improvements/route.ts
async function generateImprovements() {
  // 1. 分析結果があり、改善案が未生成の記事を取得
  const articles = await getArticlesWithAnalysisButNoImprovement();
  
  for (const article of articles) {
    try {
      // 2. 改善案を生成
      const improvement = await articleImprovementGenerator.generateImprovement(
        article.url,
        articleContent,
        whyCompetitorsRankHigher,
        recommendedAdditions,
        missingAIOElements,
        locale
      );
      
      // 3. 改善案を保存
      await saveArticleImprovement(article.id, improvement);
      
      // 4. 品質評価を実行
      const qualityScore = await evaluateImprovementQuality(improvement);
      
      // 5. 品質スコアを保存
      await updateImprovementQualityScore(improvement.id, qualityScore);
      
    } catch (error) {
      // エラーログを記録
      console.error(`Failed to generate improvement for article ${article.id}:`, error);
    }
  }
}
```

### 3.2 改善案の品質評価

**品質スコアの計算**:

```typescript
interface ImprovementQualityScore {
  totalScore: number; // 0-100点
  contentQuality: number; // 内容の質（0-40点）
  relevanceScore: number; // 関連性（0-30点）
  completenessScore: number; // 完全性（0-20点）
  readabilityScore: number; // 可読性（0-10点）
}

async function evaluateImprovementQuality(
  improvement: ArticleImprovementResult
): Promise<ImprovementQualityScore> {
  // 1. 内容の質（LLMで評価）
  const contentQuality = await evaluateWithLLM(improvement);
  
  // 2. 関連性（分析結果との整合性）
  const relevanceScore = calculateRelevance(improvement, analysisResult);
  
  // 3. 完全性（推奨項目のカバー率）
  const completenessScore = calculateCompleteness(improvement, recommendedAdditions);
  
  // 4. 可読性（文章の長さ、構造など）
  const readabilityScore = calculateReadability(improvement);
  
  return {
    totalScore: contentQuality + relevanceScore + completenessScore + readabilityScore,
    contentQuality,
    relevanceScore,
    completenessScore,
    readabilityScore,
  };
}
```

**自動適用の条件**:
- 品質スコアが80点以上の場合: 自動適用可能
- 品質スコアが60-79点の場合: ユーザー承認が必要
- 品質スコアが60点未満の場合: 手動確認が必要

---

## Phase 4: プラットフォーム連携と自動記事修正

### 4.1 WordPress API連携

**実装内容**:

1. **WordPress認証情報の管理**
   ```sql
   CREATE TABLE IF NOT EXISTS platform_integrations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
     platform_type VARCHAR(50) NOT NULL CHECK (platform_type IN ('wordpress', 'git', 'custom')),
     api_endpoint TEXT NOT NULL,
     api_key TEXT, -- 暗号化して保存
     api_secret TEXT, -- 暗号化して保存
     is_active BOOLEAN DEFAULT true,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   ```

2. **WordPress APIクライアント**
   ```typescript
   // lib/platform-integrations/wordpress.ts
   export class WordPressClient {
     async getPostByUrl(url: string): Promise<WordPressPost> {
       // WordPress REST APIで記事を取得
     }
     
     async updatePost(postId: number, content: string): Promise<WordPressPost> {
       // WordPress REST APIで記事を更新
     }
     
     async applyImprovement(postId: number, improvement: ArticleImprovementResult): Promise<void> {
       // 改善案を記事に適用
       // 1. 既存記事を取得
       // 2. 改善案を適用（Markdown → HTML変換）
       // 3. 記事を更新
     }
   }
   ```

3. **改善案の適用ロジック**
   ```typescript
   // lib/article-improvement-applier.ts
   export class ArticleImprovementApplier {
     async applyImprovement(
       articleUrl: string,
       improvement: ArticleImprovementResult,
       platform: 'wordpress' | 'git' | 'custom'
     ): Promise<ApplyResult> {
       // 1. プラットフォームに応じたクライアントを取得
       const client = this.getPlatformClient(platform);
       
       // 2. 既存記事を取得
       const existingArticle = await client.getArticle(articleUrl);
       
       // 3. 改善案を適用
       const updatedContent = this.mergeImprovement(
         existingArticle.content,
         improvement.changes
       );
       
       // 4. 記事を更新
       await client.updateArticle(articleUrl, updatedContent);
       
       return { success: true, updatedAt: new Date() };
     }
     
     private mergeImprovement(
       existingContent: string,
       changes: ArticleImprovementChange[]
     ): string {
       // Markdown形式の改善案を既存記事に適用
       // 1. 既存記事をMarkdownに変換（HTML → Markdown）
       // 2. 改善案の変更点を適用
       // 3. Markdown → HTMLに変換（WordPressの場合）
     }
   }
   ```

### 4.2 Git連携（オプション）

**実装内容**:

1. **GitHub/GitLab API連携**
   ```typescript
   // lib/platform-integrations/git.ts
   export class GitClient {
     async createPullRequest(
       repo: string,
       branch: string,
       title: string,
       content: string,
       filePath: string
     ): Promise<PullRequest> {
       // 1. ブランチを作成
       // 2. ファイルを更新
       // 3. コミット
       // 4. PRを作成
     }
   }
   ```

2. **改善案をPRとして提出**
   - 改善案をMarkdownファイルとして保存
   - 新しいブランチを作成
   - 変更をコミット
   - PRを作成（レビュー待ち）

### 4.3 カスタムプラットフォーム対応

**実装内容**:

1. **Webhook連携**
   - 改善案をWebhookで送信
   - ユーザー側で処理

2. **API連携**
   - ユーザーがカスタムAPIエンドポイントを設定
   - 改善案をAPI経由で送信

---

## 実現可能性と汎用性の分析

### WordPress連携の実現可能性

**✅ 実現可能（標準化されている）**

WordPress REST APIは標準化されており、実装は比較的容易です：

**メリット**:
- WordPress REST APIは標準仕様で、WordPress 4.7以降で利用可能
- 認証方法が明確（Application Password、OAuth等）
- 記事の取得・更新が簡単

**実装の難易度**: ⭐⭐☆☆☆（中程度）

**課題**:
- カスタムフィールドやプラグインによる拡張への対応が必要な場合がある
- テーマによってHTML構造が異なる（ただし、REST API経由なら問題なし）
- 権限管理（編集権限が必要）

**実装例**:
```typescript
// WordPress REST APIは標準化されているため、実装は比較的シンプル
const response = await fetch(`${wpUrl}/wp-json/wp/v2/posts/${postId}`, {
  headers: {
    'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
    'Content-Type': 'application/json',
  },
});

const post = await response.json();
// post.content.rendered でHTMLコンテンツを取得
// post.content.raw で生のMarkdown/HTMLを取得（編集権限が必要）
```

### 他のCMS/カスタムサイトへの対応

**⚠️ 課題が多い（各CMS/サイトごとに個別対応が必要）**

**現状の問題点**:
1. **CMSの多様性**
   - WordPress、Drupal、Joomla、Wix、Squarespace、Shopify、カスタムCMSなど
   - それぞれ異なるAPI構造
   - 認証方法も異なる

2. **カスタムサイト（フルスクラッチ）**
   - APIが存在しない場合が多い
   - 構造が完全にカスタム
   - 都度対応が必要

### 汎用的なアプローチの提案

**推奨アプローチ: 3段階の対応レベル**

#### レベル1: スクレイピングベース（最も汎用的）⭐推奨

**概要**: 既存の`ArticleScraper`を活用し、HTMLから記事を取得・更新

**メリット**:
- ✅ **あらゆるサイトに対応可能**（HTMLがあればOK）
- ✅ 既存の実装を活用できる
- ✅ CMS/プラットフォームに依存しない

**デメリット**:
- ⚠️ 更新が難しい（HTMLを直接編集する必要がある）
- ⚠️ 認証が必要なサイトには対応できない
- ⚠️ JavaScriptで動的に生成されるコンテンツにはPlaywrightが必要

**実装方針**:
```typescript
// 1. 記事をスクレイピング（既存機能）
const articleContent = await scraper.scrapeArticle(url);

// 2. 改善案を生成（既存機能）
const improvement = await generator.generateImprovement(...);

// 3. 改善案をMarkdown/HTML形式で提供
// → ユーザーが手動で適用、またはWebhookで送信
```

**適用範囲**: 全サイト対応可能（最も汎用的）

#### レベル2: 標準API連携（WordPress、主要CMS）

**概要**: 主要CMSの標準APIに対応

**対応対象**:
- WordPress（REST API）
- Contentful（Content Management API）
- Strapi（REST API）
- Ghost（Content API）
- その他標準REST APIを提供するCMS

**実装方針**:
```typescript
// プラットフォームタイプに応じたクライアントを選択
const client = platformType === 'wordpress' 
  ? new WordPressClient()
  : platformType === 'contentful'
  ? new ContentfulClient()
  : new GenericRESTClient(); // 汎用REST APIクライアント
```

**適用範囲**: 標準APIを提供するCMS（約30-40%のサイト）

#### レベル3: カスタムAPI連携（ユーザー設定）

**概要**: ユーザーがカスタムAPIエンドポイントを設定

**実装方針**:
```typescript
// ユーザーがAPI仕様を設定
interface CustomAPIConfig {
  getArticleEndpoint: string; // GET /api/articles/:id
  updateArticleEndpoint: string; // PUT /api/articles/:id
  authType: 'bearer' | 'basic' | 'custom';
  authToken: string;
}

// 汎用REST APIクライアントで対応
const client = new GenericRESTClient(customAPIConfig);
```

**適用範囲**: APIを提供するカスタムサイト（約10-20%のサイト）

### 現実的な実装戦略

**推奨: 段階的アプローチ**

#### Phase 1: スクレイピングベース（MVP）⭐最優先

**実装内容**:
1. 改善案をMarkdown/HTML形式で生成（既存機能）
2. 改善案をダウンロード可能な形式で提供
3. Webhookで改善案を送信（ユーザー側で処理）

**メリット**:
- ✅ あらゆるサイトに対応可能
- ✅ 実装が簡単（既存機能を活用）
- ✅ リスクが低い（サイトを直接変更しない）

**デメリット**:
- ⚠️ 完全自動化ではない（ユーザーが手動で適用）

**実装期間**: 1-2週間

#### Phase 2: WordPress連携（標準化されている）

**実装内容**:
1. WordPress REST APIクライアントを実装
2. 改善案をWordPressに直接適用

**メリット**:
- ✅ WordPressは市場シェアが高い（約40%）
- ✅ 標準APIで実装が容易

**実装期間**: 2-3週間

#### Phase 3: 汎用REST API連携

**実装内容**:
1. 汎用REST APIクライアントを実装
2. ユーザーがAPI仕様を設定できるUI

**メリット**:
- ✅ カスタムサイトにも対応可能
- ✅ 拡張性が高い

**実装期間**: 3-4週間

### 完全自動化の現実的な範囲

**現実的な対応範囲**:

| プラットフォーム | 対応方法 | 自動化レベル | 実装難易度 |
|----------------|---------|------------|-----------|
| WordPress | REST API | 完全自動 | ⭐⭐☆☆☆ |
| 主要CMS（Contentful等） | REST API | 完全自動 | ⭐⭐⭐☆☆ |
| カスタムサイト（API有） | カスタムAPI | 完全自動 | ⭐⭐⭐⭐☆ |
| カスタムサイト（API無） | スクレイピング | 半自動 | ⭐⭐☆☆☆ |
| 認証必須サイト | スクレイピング | 半自動 | ⭐⭐⭐☆☆ |

**結論**:
- **WordPress**: 完全自動化可能（市場シェア約40%）
- **主要CMS**: 標準APIがあれば完全自動化可能（約10-20%）
- **カスタムサイト**: スクレイピングベースで半自動化（改善案を提供、ユーザーが適用）

### 推奨実装方針

**MVP（最小実用製品）**:

1. **改善案の自動生成と提供**（既存機能を拡張）
   - 改善案をMarkdown/HTML形式で生成
   - ダウンロード可能な形式で提供
   - Webhookで送信

2. **WordPress連携**（標準化されているため優先）
   - WordPress REST APIで記事を取得・更新
   - 改善案を直接適用

3. **汎用REST API連携**（将来的に）
   - ユーザーがAPI仕様を設定
   - カスタムサイトにも対応

**段階的拡張**:
- まずはWordPressとスクレイピングベースで開始
- ユーザーの要望に応じて他のCMSに対応
- カスタムサイトはWebhook/API連携で対応

### リスクと対策

**リスク1: サイト構造の多様性**

**対策**:
- スクレイピングベースを基本とする（最も汎用的）
- WordPress等の標準APIは個別対応
- カスタムサイトはWebhook/API連携で対応

**リスク2: 認証の問題**

**対策**:
- 認証が必要なサイトは、ユーザーが認証情報を設定
- OAuth等の標準認証に対応
- 認証できない場合は、改善案を提供するだけ（半自動）

**リスク3: 記事の破壊的変更**

**対策**:
- バックアップ機能を実装
- 変更履歴を保存
- テスト環境での適用を推奨
- 段階的な適用（一部のみ適用可能）

---

## Phase 5: 自動適用と承認フロー

### 5.1 自動適用の条件

**完全自動適用（承認不要）**:
- 品質スコアが80点以上
- ユーザーが「完全自動モード」を有効にしている
- 改善案の変更が「追加のみ」（既存内容の変更なし）

**承認が必要な場合**:
- 品質スコアが60-79点
- 既存内容の変更を含む改善案
- ユーザーが「承認必須モード」を設定している

### 5.2 承認フロー

**実装内容**:

1. **承認待ち改善案の管理**
   ```sql
   CREATE TABLE IF NOT EXISTS improvement_approvals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     improvement_id UUID NOT NULL REFERENCES article_improvements(id) ON DELETE CASCADE,
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
     user_notes TEXT,
     approved_at TIMESTAMP WITH TIME ZONE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   ```

2. **通知と承認UI**
   - 承認待ち改善案をダッシュボードに表示
   - メール/Slackで通知
   - ワンクリック承認機能

### 5.3 適用後の監視

**実装内容**:

1. **修正効果の測定**
   - 修正前後の順位比較
   - インプレッション数・クリック数の変化
   - CTRの変化

2. **効果レポート**
   - 週次/月次レポートを自動生成
   - 改善効果の可視化

---

## データベーススキーマ拡張

### 新規テーブル

```sql
-- プラットフォーム連携
CREATE TABLE IF NOT EXISTS platform_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  platform_type VARCHAR(50) NOT NULL CHECK (platform_type IN ('wordpress', 'git', 'custom')),
  api_endpoint TEXT NOT NULL,
  api_key TEXT, -- 暗号化
  api_secret TEXT, -- 暗号化
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 記事改善案
CREATE TABLE IF NOT EXISTS article_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  improvement_data JSONB NOT NULL,
  quality_score DECIMAL(5,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'applied', 'rejected')),
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 改善案承認
CREATE TABLE IF NOT EXISTS improvement_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id UUID NOT NULL REFERENCES article_improvements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
  user_notes TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 自動適用履歴
CREATE TABLE IF NOT EXISTS auto_apply_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id UUID NOT NULL REFERENCES article_improvements(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  platform_type VARCHAR(50) NOT NULL,
  applied_content TEXT,
  before_position DECIMAL(5,2),
  after_position DECIMAL(5,2),
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 既存テーブルの拡張

```sql
-- articlesテーブル
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_score DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS last_discovered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS auto_improvement_enabled BOOLEAN DEFAULT false;

-- sitesテーブル
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS auto_discovery_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_improvement_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_apply_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_priority_score INTEGER DEFAULT 500; -- 自動改善の最低優先度スコア
```

---

## Cron Job設計

### 新規Cron Job

1. **`/api/cron/discover-articles`** (週1回)
   - GSCデータから記事を自動発見
   - 優先度スコアを計算

2. **`/api/cron/calculate-priority-scores`** (週1回)
   - 全記事の優先度スコアを再計算
   - 監視頻度を更新

3. **`/api/cron/auto-analyze-articles`** (1日1回)
   - 改善が必要な記事を検知
   - 自動で競合分析を実行

4. **`/api/cron/generate-improvements`** (1時間ごと)
   - 分析結果がある記事の改善案を生成
   - 品質評価を実行

5. **`/api/cron/auto-apply-improvements`** (1時間ごと)
   - 承認済みまたは自動適用可能な改善案を適用
   - プラットフォーム連携で記事を更新

6. **`/api/cron/measure-improvement-effects`** (1日1回)
   - 適用後の効果を測定
   - レポートを生成

---

## ユーザー設定

### 自動化設定

```typescript
interface AutomationSettings {
  // 記事発見
  autoDiscoveryEnabled: boolean; // 自動記事発見を有効化
  discoveryFrequency: 'daily' | 'weekly' | 'monthly'; // 発見頻度
  
  // 優先度スコア
  minPriorityScore: number; // 監視対象の最低優先度スコア
  
  // 自動分析
  autoAnalysisEnabled: boolean; // 自動競合分析を有効化
  analysisTriggers: {
    positionDrop: number; // 順位下落の閾値（例: 3位）
    impressionsDrop: number; // インプレッション減少の閾値（例: 20%）
    clicksDrop: number; // クリック数減少の閾値（例: 30%）
  };
  
  // 自動改善案生成
  autoImprovementGenerationEnabled: boolean; // 自動改善案生成を有効化
  
  // 自動適用
  autoApplyEnabled: boolean; // 自動適用を有効化
  autoApplyMode: 'full' | 'approval_required' | 'manual'; // 自動適用モード
  minQualityScore: number; // 自動適用の最低品質スコア（例: 80点）
  
  // 通知設定
  notifyOnImprovementGenerated: boolean; // 改善案生成時に通知
  notifyOnImprovementApplied: boolean; // 改善案適用時に通知
  notifyOnApprovalRequired: boolean; // 承認が必要な場合に通知
}
```

---

## コスト試算

### 1記事あたりのコスト

**記事発見**: 無料（GSC APIは無料）

**競合分析**: 約0.5円
- Serper API: 約0.3円
- スクレイピング: 約0.1円
- LLM分析: 約0.1円

**改善案生成**: 約0.3円
- Gemini 2.0 Flash Lite: 約0.3円

**品質評価**: 約0.1円
- Gemini 2.0 Flash Lite: 約0.1円

**合計**: 約0.9円/記事

### 月間コスト試算

**想定シナリオ**:
- サイト数: 100サイト
- 1サイトあたりの記事数: 50記事
- 月間改善対象記事数: 10記事/サイト

**計算**:
- 100サイト × 10記事 × 0.9円 = **900円/月**

**スケール時**:
- 1000サイト × 10記事 × 0.9円 = **9,000円/月**

---

## 実装の優先順位

### Phase 1: 自動記事発見と優先度スコアリング（MVP）
1. ✅ GSCデータから記事を自動発見
2. ✅ 優先度スコアリング機能
3. ✅ 優先度に基づく監視頻度の自動設定

### Phase 2: 自動分析と改善案生成
4. ✅ 改善検知と自動競合分析
5. ✅ 自動改善案生成
6. ✅ 品質評価機能

### Phase 3: プラットフォーム連携
7. ✅ WordPress API連携
8. ✅ 改善案の自動適用機能
9. ✅ Git連携（オプション）

### Phase 4: 承認フローと効果測定
10. ✅ 承認フロー
11. ✅ 適用後の効果測定
12. ✅ レポート機能

---

## リスクと対策

### リスク1: 改善案の品質が不十分

**対策**:
- 品質スコアによる自動評価
- 80点以上のみ自動適用
- ユーザーが承認できる仕組み

### リスク2: コストの増大

**対策**:
- 優先度スコアリングで対象を絞る
- ユーザーごとの制限設定
- 有料プランのみ完全自動化

### リスク3: プラットフォーム連携の複雑さ

**対策**:
- WordPressから段階的に実装
- エラーハンドリングの強化
- ロールバック機能

### リスク4: 記事の破壊的変更

**対策**:
- バックアップ機能
- 変更履歴の保存
- 段階的な適用（テスト → 本番）

---

## まとめ

この全自動化システムにより、以下の価値を提供できます：

1. **完全自動化**: サイト登録だけで、あとは自動で記事改善
2. **効率的な優先順位付け**: インプレッション数やクリック数から注力すべき記事を自動選定
3. **迅速な対応**: 順位下落を検知してから改善まで自動化
4. **プラットフォーム連携**: WordPress等と連携して自動で記事修正
5. **効果測定**: 改善効果を自動で測定・レポート

**実装期間の目安**:
- Phase 1: 2-3週間
- Phase 2: 3-4週間
- Phase 3: 4-6週間
- Phase 4: 2-3週間

**合計**: 約3-4ヶ月で完全自動化システムを構築可能

---

## 実現可能性の総括

### 結論: 段階的アプローチで実現可能

**✅ 実現可能な部分**:
1. **自動記事発見と優先度スコアリング**: 完全に実現可能（GSC APIは標準化されている）
2. **自動監視と改善検知**: 既存機能を拡張すれば実現可能
3. **自動改善案生成**: 既存機能を拡張すれば実現可能
4. **WordPress連携**: 実現可能（標準API）

**⚠️ 課題がある部分**:
1. **カスタムサイトの完全自動化**: 各サイトごとに個別対応が必要
2. **汎用的な自動適用**: プラットフォーム依存

### 推奨実装戦略

#### 短期（MVP）: スクレイピングベース + WordPress

**実装内容**:
1. 改善案の自動生成と提供（Markdown/HTML形式）
2. WordPress REST API連携（完全自動化）
3. 改善案のダウンロード機能
4. Webhook連携（カスタムサイト対応）

**対応範囲**:
- WordPress: 完全自動化（約40%のサイト）
- その他: 半自動化（改善案を提供、ユーザーが適用）

**実装期間**: 1-2ヶ月

#### 中期: 主要CMS対応

**実装内容**:
1. Contentful、Strapi等の主要CMSに対応
2. 汎用REST API連携（ユーザー設定）

**対応範囲**:
- WordPress + 主要CMS: 完全自動化（約50-60%のサイト）
- その他: 半自動化

**実装期間**: 追加2-3ヶ月

#### 長期: カスタムサイト対応

**実装内容**:
1. カスタムAPI仕様の設定UI
2. より高度なスクレイピング機能
3. 認証対応の強化

**対応範囲**:
- 標準CMS: 完全自動化
- カスタムサイト（API有）: 完全自動化（ユーザー設定）
- カスタムサイト（API無）: 半自動化

**実装期間**: 継続的

### 現実的な期待値

**完全自動化が可能なサイト**:
- WordPress: ✅ 完全自動化可能
- 主要CMS（標準API有）: ✅ 完全自動化可能
- カスタムサイト（API有）: ✅ 完全自動化可能（ユーザー設定）

**半自動化（改善案提供）のサイト**:
- カスタムサイト（API無）: ⚠️ 改善案を提供、ユーザーが適用
- 認証必須サイト: ⚠️ 改善案を提供、ユーザーが適用

**市場カバレッジ**:
- 完全自動化: 約50-60%（WordPress + 主要CMS）
- 半自動化: 約40-50%（カスタムサイト）

### 最終的な推奨方針

**MVPとして実装すべき機能**:

1. **自動記事発見と優先度スコアリング** ✅
   - GSC APIから記事を自動発見
   - 優先度スコアを計算
   - 監視頻度を自動設定

2. **自動改善案生成** ✅
   - 順位下落検知時に自動生成
   - 品質評価を実行

3. **改善案の提供** ✅
   - Markdown/HTML形式でダウンロード可能
   - Webhookで送信
   - ダッシュボードで確認

4. **WordPress連携** ✅
   - WordPress REST APIで完全自動化
   - 改善案を直接適用

**将来的に追加すべき機能**:

5. **主要CMS対応**
   - Contentful、Strapi等

6. **汎用REST API連携**
   - ユーザーがAPI仕様を設定

7. **Git連携**
   - PRとして改善案を提出

**結論**: 
- **WordPressとスクレイピングベースで開始**すれば、約50-60%のサイトに対応可能
- **カスタムサイトは段階的に対応**（Webhook/API連携）
- **完全自動化はWordPress等の標準CMSに限定**し、カスタムサイトは半自動化（改善案提供）とするのが現実的
