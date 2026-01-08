# スケーラビリティ改善案（1000ユーザー規模対応）

## 現状の問題

### check-rank（順位チェック）

**現在の実装:**
- 全監視記事を1回の実行で順次処理
- 記事数が増えると処理時間が線形に増加
- 1000ユーザー × 平均10記事 = 10,000記事の場合、約33-83時間かかる可能性

**問題点:**
- 全ユーザーを同じ時刻で処理する必要はない
- タイムアウトのリスクが高い

### send-notifications（通知送信）

**現在の実装:**
- ユーザーごとの通知時刻をチェックして送信（時刻分散あり）
- 1時間ごとに実行
- 1000ユーザーが同じ時刻に設定している場合、1時間で処理しきれない可能性

**問題点:**
- ユーザーが特定の時刻に集中している場合、処理が集中する
- タイムアウトのリスクがある

---

## 改善案

### 1. check-rankの時間分散処理

#### 実装方針

**ユーザーIDのハッシュ値を使って、1日を複数の時間帯に分散**

```typescript
// ユーザーIDのハッシュ値から処理時刻を決定
function getCheckRankTimeSlot(userId: string, totalSlots: number): number {
  // ユーザーIDをハッシュ化してスロット番号を決定
  const hash = simpleHash(userId);
  return hash % totalSlots;
}

// 1日を24スロット（1時間ごと）に分割
// または12スロット（2時間ごと）に分割
```

**メリット:**
- 処理を1日を通して分散
- 各ユーザーは毎日同じ時刻に処理される（一貫性）
- タイムアウトのリスクを大幅に削減

**実装方法:**
1. 1日を24スロット（1時間ごと）または12スロット（2時間ごと）に分割
2. ユーザーIDのハッシュ値でスロットを決定
3. 各スロットごとにGitHub Actionsを実行
4. 該当スロットのユーザーの記事のみを処理

#### 例：24スロット（1時間ごと）

- 00:00 UTC: スロット0のユーザー
- 01:00 UTC: スロット1のユーザー
- ...
- 23:00 UTC: スロット23のユーザー

**処理時間の見積もり:**
- 1000ユーザー ÷ 24スロット = 約42ユーザー/スロット
- 42ユーザー × 10記事 = 420記事/スロット
- 420記事 × 3秒 = 約21分（余裕あり）

---

### 2. send-notificationsの最適化

#### 現状の確認

既にユーザーごとの通知時刻設定があるため、基本的には分散されている。

**改善点:**
1. **バッチ処理**: 通知をバッチに分けて処理
2. **優先度付け**: 緊急度の高い通知を優先
3. **並列処理**: 可能な範囲で並列処理

#### 実装方針

```typescript
// 通知をバッチに分けて処理
const BATCH_SIZE = 100; // 1回の実行で処理する通知数

// 1. 通知を取得
const notifications = await getPendingNotifications();

// 2. バッチに分割
const batches = chunkArray(notifications, BATCH_SIZE);

// 3. 各バッチを順次処理
for (const batch of batches) {
  await processBatch(batch);
}
```

---

### 3. バッチ処理の実装

#### check-rankのバッチ処理

```typescript
// 記事をバッチに分けて処理
const BATCH_SIZE = 100; // 1回の実行で処理する記事数

// 1. 監視記事を取得
const articles = await getMonitoringArticles();

// 2. バッチに分割
const batches = chunkArray(articles, BATCH_SIZE);

// 3. 各バッチを順次処理
for (const batch of batches) {
  await processBatch(batch);
}
```

**メリット:**
- タイムアウトのリスクを削減
- エラー時のリトライが容易
- 進捗状況の把握が容易

---

### 4. 並列処理の実装（将来）

#### 同じユーザーの記事をまとめて処理

```typescript
// ユーザーごとに記事をグループ化
const articlesByUser = groupBy(articles, 'user_id');

// 各ユーザーの記事を並列処理（制限付き）
const MAX_CONCURRENT_USERS = 5;
const userIds = Array.from(articlesByUser.keys());

for (let i = 0; i < userIds.length; i += MAX_CONCURRENT_USERS) {
  const batch = userIds.slice(i, i + MAX_CONCURRENT_USERS);
  await Promise.all(
    batch.map(userId => processUserArticles(articlesByUser.get(userId)!))
  );
}
```

**メリット:**
- 処理時間の短縮
- GSCクライアントの再利用

**注意点:**
- GSC APIのレート制限に注意
- 並列数を制限する必要がある

---

### 5. キューイングシステムの導入（将来）

#### 推奨: Supabase Queue または BullMQ

**メリット:**
- ジョブの永続化
- リトライ機能
- 優先度付け
- 並列処理の制御

**実装例:**
```typescript
// キューにジョブを追加
await queue.add('check-rank', {
  userId: user.id,
  articleIds: articleIds,
}, {
  priority: 1,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
});
```

---

## 実装優先順位

### Phase 1: 即座に実装（必須）

1. **check-rankの時間分散処理**
   - ユーザーIDのハッシュ値でスロットを決定
   - 1日を24スロット（1時間ごと）に分割
   - GitHub Actionsで各スロットごとに実行

2. **バッチ処理の実装**
   - 記事を100件ずつに分割
   - エラーハンドリングの改善

### Phase 2: 中期的に実装（推奨）

3. **send-notificationsのバッチ処理**
   - 通知を100件ずつに分割
   - 処理時間の短縮

4. **並列処理の実装**
   - 同じユーザーの記事をまとめて処理
   - GSCクライアントの再利用

### Phase 3: 長期的に実装（将来）

5. **キューイングシステムの導入**
   - Supabase Queue または BullMQ
   - ジョブの永続化とリトライ機能

---

## 実装詳細

### check-rankの時間分散処理

#### 1. スロット計算関数

```typescript
// lib/cron/slot-calculator.ts
export function getCheckRankTimeSlot(userId: string, totalSlots: number = 24): number {
  // シンプルなハッシュ関数
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % totalSlots;
}

export function getCurrentTimeSlot(totalSlots: number = 24): number {
  const now = new Date();
  const hours = now.getUTCHours();
  return hours % totalSlots;
}
```

#### 2. 記事取得の修正

```typescript
// lib/db/articles.ts
export async function getMonitoringArticlesForSlot(slot: number, totalSlots: number = 24): Promise<Article[]> {
  const supabase = createSupabaseClient();
  
  // 全監視記事を取得
  const { data: allArticles, error } = await supabase
    .from('articles')
    .select('*, user_id')
    .eq('is_monitoring', true)
    .is('deleted_at', null)
    .order('last_analyzed_at', { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Failed to get monitoring articles: ${error.message}`);
  }

  // スロットに該当する記事のみをフィルタ
  const articlesForSlot = (allArticles || []).filter(article => {
    const articleSlot = getCheckRankTimeSlot(article.user_id, totalSlots);
    return articleSlot === slot;
  });

  return articlesForSlot as Article[];
}
```

#### 3. APIエンドポイントの修正

```typescript
// app/api/cron/check-rank/route.ts
export async function GET(request: NextRequest) {
  // ...
  
  const searchParams = request.nextUrl.searchParams;
  const slot = searchParams.get('slot');
  const totalSlots = 24;
  
  // スロットが指定されていない場合は現在のスロットを使用
  const currentSlot = slot ? parseInt(slot, 10) : getCurrentTimeSlot(totalSlots);
  
  // 該当スロットの記事のみを取得
  const articles = await getMonitoringArticlesForSlot(currentSlot, totalSlots);
  
  // ...
}
```

#### 4. GitHub Actionsワークフローの修正

```yaml
# .github/workflows/check-rank.yml
name: Check Rank Drops

on:
  schedule:
    # 1時間ごとに実行（24スロット）
    - cron: '0 * * * *'
  workflow_dispatch:
    inputs:
      slot:
        description: 'Time slot (0-23)'
        required: false
        type: number

jobs:
  check-rank:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    
    steps:
      - name: Call Check Rank API
        run: |
          VERCEL_URL=$(echo "${{ vars.VERCEL_URL }}" | sed 's|/$||')
          VERCEL_URL=$(echo "${VERCEL_URL}" | sed 's|https://rerank-ai\.com|https://www.rerank-ai.com|g')
          
          # スロットを決定（手動実行の場合は指定されたスロット、スケジュール実行の場合は現在の時刻から計算）
          if [ -n "${{ github.event.inputs.slot }}" ]; then
            SLOT="${{ github.event.inputs.slot }}"
          else
            # 現在のUTC時刻からスロットを計算（0-23）
            SLOT=$(date -u +%H)
          fi
          
          echo "🔄 Starting rank check job for slot ${SLOT}..."
          response=$(curl -s -w "\n%{http_code}" -X GET "${VERCEL_URL}/api/cron/check-rank?slot=${SLOT}" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json")
          
          # ...
```

---

## 処理時間の見積もり（改善後）

### check-rank（時間分散後）

**前提:**
- 1000ユーザー
- 平均10記事/ユーザー
- 24スロット（1時間ごと）

**計算:**
- 1スロットあたり: 1000 ÷ 24 ≈ 42ユーザー
- 1スロットあたりの記事数: 42 × 10 = 420記事
- 処理時間: 420記事 × 3秒 = 約21分

**結論:** 60分のタイムアウト内で余裕を持って処理可能

### send-notifications（現状維持 + バッチ処理）

**前提:**
- 1000ユーザー
- 1時間あたりの通知: 100件（ユーザーが分散している場合）

**計算:**
- バッチサイズ: 100件
- 1バッチの処理時間: 約5分
- 合計処理時間: 約5分

**結論:** 問題なし

---

## まとめ

### 即座に実装すべき改善

1. **check-rankの時間分散処理**
   - 24スロット（1時間ごと）に分散
   - 処理時間を約1/24に削減
   - タイムアウトのリスクを大幅に削減

2. **バッチ処理の実装**
   - エラーハンドリングの改善
   - リトライ機能の追加

### 1000ユーザー規模での対応

- **check-rank**: 時間分散により対応可能
- **send-notifications**: 既に時刻分散あり + バッチ処理で対応可能

### 将来の拡張

- 並列処理の実装
- キューイングシステムの導入
- リアルタイム処理への移行
