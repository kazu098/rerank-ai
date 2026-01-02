# パフォーマンス最適化プラン

## 現状の問題

1. **記事一覧の読み込みが重い**
   - Search Console APIから過去90日間の全記事データを取得
   - 一度に大量のデータを取得してフロントエンドで処理
   - ページネーションはあるが、初期データ取得が重い

2. **ダッシュボードの読み込みが重い**
   - 全ての記事データと分析結果を一度に取得
   - 分析結果の詳細データ（blob）を一括取得している可能性

3. **Search Console APIの無駄な呼び出し**
   - 既に分析済みの記事についても、過去90日間の全データを再取得
   - 前回の分析日以降のデータのみで十分なのに、全期間を取得

4. **フロントエンドでの処理が重い**
   - 大量のデータをフロントエンドでフィルタリング・ソート
   - メモリに大量のデータを保持

## 改善案

### 1. Search Console APIの最適化

#### 1.1 分析済み記事のデータ取得期間を最適化

**現状:**
- 全記事に対して過去90日間のデータを取得

**改善案:**
- 既に分析済みの記事については、前回分析日以降のデータのみを取得
- 初回分析の記事のみ、過去90日間のデータを取得

**実装方針:**
```typescript
// app/api/articles/list/route.ts
const mergedArticles = Array.from(urlMap.values()).map((gscUrl) => {
  const dbArticle = dbArticles.find((a) => {
    const normalizedDbUrl = normalizeUrl(a.url);
    return normalizedDbUrl === gscUrl.url;
  });
  
  // 分析済みの場合は、前回分析日以降の期間を計算
  if (dbArticle?.last_analyzed_at) {
    const lastAnalyzedDate = new Date(dbArticle.last_analyzed_at);
    const daysSinceLastAnalysis = Math.floor(
      (Date.now() - lastAnalyzedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    // 最小7日、最大90日間のデータを取得
    const dataRange = Math.min(Math.max(daysSinceLastAnalysis, 7), 90);
    // この記事だけ異なる期間で取得する必要がある
    // → 実装は複雑になるため、バッチ処理で最適化する方が良いかも
  }
  
  return {
    url: gscUrl.url,
    title: dbArticle?.title || null,
    // ...
  };
});
```

**注意点:**
- 各記事ごとに異なる期間でAPIを呼び出すと、API呼び出し回数が増える
- バッチ処理でまとめて取得する方が効率的

**代替案（推奨）:**
- 全記事に対して過去90日間のデータを取得するが、フロントエンドでの表示を最適化
- バックエンドで分析済み記事のデータをキャッシュし、更新頻度を下げる
- 分析済み記事のデータは1日1回更新で十分

#### 1.2 データ取得のバッチ処理とキャッシュ

**改善案:**
- 記事一覧のデータをバックエンドでキャッシュ（Redis等）
- キャッシュの有効期限: 1時間（分析済み記事は24時間）
- キャッシュがある場合は、キャッシュから返す

**実装方針:**
```typescript
// app/api/articles/list/route.ts
export async function GET(request: NextRequest) {
  // キャッシュキーを生成
  const cacheKey = `articles:list:${site.id}`;
  
  // キャッシュをチェック
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }
  
  // GSC APIからデータを取得
  const gscData = await gscClient.getPageUrls(siteUrl, startDate, endDate, 1000);
  
  // データを処理
  const mergedArticles = /* ... */;
  
  // キャッシュに保存（TTL: 1時間）
  await redis.setex(cacheKey, 3600, JSON.stringify({ articles: mergedArticles, total: mergedArticles.length }));
  
  return NextResponse.json({ articles: mergedArticles, total: mergedArticles.length });
}
```

#### 1.3 ページネーション対応のAPI

**改善案:**
- バックエンドでページネーションを実装
- フロントエンドからページ番号とページサイズを指定
- 必要なデータのみを取得

**実装方針:**
```typescript
// app/api/articles/list/route.ts
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");
  
  // GSC APIから全データを取得（キャッシュから取得可能）
  const allArticles = await getCachedOrFetchArticles(site);
  
  // バックエンドでページネーション
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedArticles = allArticles.slice(startIndex, endIndex);
  
  return NextResponse.json({
    articles: paginatedArticles,
    total: allArticles.length,
    page,
    pageSize,
    totalPages: Math.ceil(allArticles.length / pageSize),
  });
}
```

### 2. フロントエンドの最適化

#### 2.1 記事一覧モーダルのページネーション改善

**現状:**
- フロントエンドで全データを保持
- クライアントサイドでページネーション

**改善案:**
- バックエンドでページネーションを実装
- 必要なページのみを取得
- スクロール時に次のページを読み込む（無限スクロール）

**実装方針:**
```typescript
// components/landing/AuthenticatedContent.tsx
const [articles, setArticles] = useState<any[]>([]);
const [totalPages, setTotalPages] = useState(1);
const [loadingArticles, setLoadingArticles] = useState(false);

const loadArticles = async (siteUrl: string, page: number = 1) => {
  setLoadingArticles(true);
  try {
    const response = await fetch(
      `/api/articles/list?siteUrl=${encodeURIComponent(siteUrl)}&page=${page}&pageSize=50`
    );
    const result = await response.json();
    
    if (page === 1) {
      setArticles(result.articles);
    } else {
      setArticles((prev) => [...prev, ...result.articles]);
    }
    setTotalPages(result.totalPages);
  } finally {
    setLoadingArticles(false);
  }
};

// 無限スクロール
const handleScroll = useCallback(() => {
  if (
    articleListRef.current &&
    articleListRef.current.scrollTop + articleListRef.current.clientHeight >=
      articleListRef.current.scrollHeight - 100
  ) {
    if (articlePage < totalPages && !loadingArticles) {
      loadArticles(selectedSiteUrl, articlePage + 1);
      setArticlePage((prev) => prev + 1);
    }
  }
}, [articlePage, totalPages, loadingArticles, selectedSiteUrl]);
```

#### 2.2 仮想スクロールの導入

**改善案:**
- 大量の記事を表示する際に、仮想スクロールを使用
- 表示されている項目のみをレンダリング

**実装方針:**
- `react-window`や`react-virtualized`などのライブラリを使用
- 1000件以上の記事がある場合に有効

#### 2.3 データの遅延読み込み

**改善案:**
- 記事一覧の詳細データ（インプレッション数、クリック数など）を遅延読み込み
- 最初はURLとタイトルのみを表示
- スクロールして表示されたら詳細データを取得

**実装方針:**
```typescript
// Intersection Observer APIを使用
const observerRef = useRef<IntersectionObserver>();

useEffect(() => {
  observerRef.current = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const articleUrl = entry.target.getAttribute('data-url');
        // 詳細データを取得
        loadArticleDetails(articleUrl);
      }
    });
  });
  
  return () => {
    observerRef.current?.disconnect();
  };
}, []);

// 各記事要素にobserverを設定
<div ref={(el) => {
  if (el && !article.detailsLoaded) {
    observerRef.current?.observe(el);
  }
}} data-url={article.url}>
  {/* 記事コンテンツ */}
</div>
```

### 3. ダッシュボードの最適化

#### 3.1 分析結果の遅延読み込み

**現状:**
- 全ての記事の分析結果を一度に取得

**改善案:**
- 初期表示時は記事の基本情報のみを取得
- 分析結果は詳細ページに遷移した時に取得
- または、表示されている記事のみ分析結果を取得

**実装方針:**
```typescript
// app/api/dashboard/data/route.ts
export async function GET(request: NextRequest) {
  // 基本情報のみを取得（分析結果の詳細データは含めない）
  const articles = await getArticlesByUserId(userId);
  
  const articlesWithSummary = articles.map((article) => ({
    id: article.id,
    url: article.url,
    title: article.title,
    last_analyzed_at: article.last_analyzed_at,
    // latestAnalysisの詳細は含めない、または要約のみ
    latestAnalysisSummary: article.latestAnalysis ? {
      average_position: article.latestAnalysis.average_position,
      position_change: article.latestAnalysis.position_change,
    } : null,
  }));
  
  return NextResponse.json({
    articles: articlesWithSummary,
    // ...
  });
}
```

#### 3.2 ページネーションの導入

**改善案:**
- ダッシュボードの記事一覧にもページネーションを導入
- デフォルトで20-50件ずつ表示
- 「もっと見る」ボタンまたはページネーション

**実装方針:**
```typescript
// app/[locale]/dashboard/page.tsx
const [currentPage, setCurrentPage] = useState(1);
const itemsPerPage = 20;

const paginatedArticles = articles.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
);
```

#### 3.3 サーバーサイドでのソート・フィルタ

**改善案:**
- ソート・フィルタをサーバーサイドで実行
- フロントエンドでソート・フィルタを行うと、全データを保持する必要がある

**実装方針:**
```typescript
// app/api/dashboard/data/route.ts
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filter = searchParams.get("filter"); // "monitoring" | "fixed" | "all"
  const sortBy = searchParams.get("sortBy"); // "date" | "position" | "title"
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  
  // サーバーサイドでフィルタ・ソート
  let articles = await getArticlesByUserId(userId);
  
  if (filter === "monitoring") {
    articles = articles.filter((a) => a.is_monitoring);
  } else if (filter === "fixed") {
    articles = articles.filter((a) => a.is_fixed);
  }
  
  // ソート
  articles.sort((a, b) => {
    if (sortBy === "date") {
      // ...
    }
    // ...
  });
  
  // ページネーション
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedArticles = articles.slice(startIndex, endIndex);
  
  return NextResponse.json({
    articles: paginatedArticles,
    total: articles.length,
    page,
    pageSize,
    totalPages: Math.ceil(articles.length / pageSize),
  });
}
```

### 4. データベースクエリの最適化

#### 4.1 インデックスの追加

**改善案:**
- よく使用されるカラムにインデックスを追加
- `user_id`, `site_id`, `last_analyzed_at`, `is_monitoring`など

**実装方針:**
```sql
-- articlesテーブル
CREATE INDEX idx_articles_user_id ON articles(user_id);
CREATE INDEX idx_articles_site_id ON articles(site_id);
CREATE INDEX idx_articles_last_analyzed_at ON articles(last_analyzed_at);
CREATE INDEX idx_articles_is_monitoring ON articles(is_monitoring);
CREATE INDEX idx_articles_user_id_site_id ON articles(user_id, site_id);

-- analysis_resultsテーブル
CREATE INDEX idx_analysis_results_article_id ON analysis_results(article_id);
CREATE INDEX idx_analysis_results_created_at ON analysis_results(created_at);
```

#### 4.2 N+1クエリの解決

**改善案:**
- 記事と分析結果をJOINで一度に取得
- または、バッチで取得

**実装方針:**
```typescript
// 現状: N+1クエリ
const articles = await getArticlesByUserId(userId);
for (const article of articles) {
  article.latestAnalysis = await getLatestAnalysisByArticleId(article.id);
}

// 改善: JOINまたはバッチ取得
const articles = await getArticlesWithLatestAnalysisByUserId(userId);
// または
const articleIds = articles.map((a) => a.id);
const analyses = await getLatestAnalysesByArticleIds(articleIds);
const analysisMap = new Map(analyses.map((a) => [a.article_id, a]));
articles.forEach((article) => {
  article.latestAnalysis = analysisMap.get(article.id);
});
```

### 5. キャッシュ戦略

#### 5.1 Redisキャッシュの導入

**改善案:**
- 頻繁にアクセスされるデータをRedisにキャッシュ
- 記事一覧、分析結果のサマリーなど

**キャッシュ対象:**
- 記事一覧（TTL: 1時間）
- 分析済み記事のデータ（TTL: 24時間）
- ダッシュボードのサマリーデータ（TTL: 5分）

#### 5.2 ブラウザキャッシュの活用

**改善案:**
- 静的リソースのキャッシュ
- APIレスポンスのキャッシュ（適切なCache-Controlヘッダー）

**実装方針:**
```typescript
// app/api/articles/list/route.ts
return NextResponse.json(
  { articles: mergedArticles, total: mergedArticles.length },
  {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  }
);
```

### 6. UX改善

#### 6.1 ローディング状態の改善

**改善案:**
- スケルトンスクリーンの導入
- 段階的なデータ読み込みの視覚的フィードバック

#### 6.2 検索機能の最適化

**改善案:**
- 検索をデバウンス
- サーバーサイド検索（大量データの場合）

**実装方針:**
```typescript
const [searchQuery, setSearchQuery] = useState("");
const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearchQuery(searchQuery);
  }, 300);
  
  return () => clearTimeout(timer);
}, [searchQuery]);
```

#### 6.3 ページネーションUIの改善

**改善案:**
- ページネーションコンポーネントの追加
- 「最初へ」「最後へ」ボタン
- 現在のページ番号と総ページ数の表示

## 実装優先度

### 高優先度（即座に効果がある）
1. ✅ 記事一覧APIのページネーション（バックエンド）
2. ✅ ダッシュボードのページネーション
3. ✅ データベースインデックスの追加
4. ✅ N+1クエリの解決

### 中優先度（中期的に効果がある）
5. ⚠️ Redisキャッシュの導入
6. ⚠️ 分析結果の遅延読み込み
7. ⚠️ 検索のデバウンス

### 低優先度（長期的な最適化）
8. 🔄 仮想スクロールの導入
9. 🔄 Intersection Observerによる遅延読み込み
10. 🔄 Search Console APIの期間最適化（複雑なため後回し）

## 期待される効果

- **初期読み込み時間**: 50-70%短縮
- **メモリ使用量**: 60-80%削減
- **API呼び出し回数**: 30-50%削減
- **ユーザー体験**: スムーズな操作感、段階的なデータ読み込み

## 実装時の注意点

1. **後方互換性**: 既存のAPIを使用している箇所があるため、段階的な移行が必要
2. **エラーハンドリング**: キャッシュが失敗した場合のフォールバック処理
3. **テスト**: パフォーマンステストの追加
4. **モニタリング**: パフォーマンスメトリクスの計測とアラート設定

