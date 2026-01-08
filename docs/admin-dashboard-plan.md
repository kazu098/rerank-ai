# スーパー管理画面ダッシュボード実装方針

## 1. 概要

スーパー管理画面は、サービスの運営状況を把握し、ビジネス判断に必要なKPI（Key Performance Indicators）を可視化するための管理ツールです。管理者のみがアクセス可能で、ユーザーの作成状況、契約状況、記事分析の利用状況などを一元管理できます。

## 2. 目的

- **ビジネス状況の可視化**: ユーザー数、契約状況、利用状況をリアルタイムで把握
- **データドリブンな意思決定**: KPIに基づいたマーケティング戦略や機能開発の判断
- **問題の早期発見**: 異常な利用パターンや契約状況の変化を迅速に検知
- **運用効率化**: 手動でのデータ集計を自動化し、管理工数を削減

## 3. 対象KPI指標

### 3.1 ユーザー関連KPI

#### 3.1.1 ユーザー作成状況
- **総ユーザー数**: 全期間の累計登録ユーザー数
- **アクティブユーザー数**: 過去30日以内にログインしたユーザー数
- **新規登録ユーザー数**: 
  - 今日
  - 今週
  - 今月
  - 先月
  - 前月比（%）
- **ユーザー登録トレンド**: 日次/週次/月次の登録数の推移グラフ
- **認証方法別の内訳**: Google OAuth / メール・パスワード認証の割合

#### 3.1.2 ユーザーエンゲージメント
- **ログイン率**: 過去30日以内にログインしたユーザーの割合
- **最終ログイン日時**: ユーザーごとの最終ログイン日時
- **平均セッション時間**: ユーザーの平均利用時間（将来的に実装）
- **離脱ユーザー数**: 過去90日以上ログインしていないユーザー数

### 3.2 契約状況KPI

#### 3.2.1 プラン別ユーザー数
- **プラン別の現在のユーザー数**:
  - Freeプラン
  - Starterプラン
  - Standardプラン
  - Businessプラン
- **プラン別の新規契約数**: 今月/先月のプラン別新規契約数
- **プラン変更数**: アップグレード/ダウングレードの件数
- **プラン変更トレンド**: プラン変更の推移グラフ

#### 3.2.2 サブスクリプション状況
- **アクティブサブスクリプション数**: 有料プランのアクティブな契約数
- **解約数**: 今月/先月の解約数
- **解約率**: 解約数 / アクティブサブスクリプション数
- **MRR (Monthly Recurring Revenue)**: 月間経常収益
  - プラン別のMRR内訳
  - MRRの推移グラフ
- **ARR (Annual Recurring Revenue)**: 年間経常収益（MRR × 12）
- **Churn Rate**: 解約率（月次/年次）

#### 3.2.3 トライアル状況
- **トライアル中ユーザー数**: 現在トライアル期間中のユーザー数
- **トライアル→有料プラン転換数**: 今月/先月の転換数
- **トライアル転換率**: 転換数 / トライアル開始数
- **トライアル期間中の平均利用状況**: 分析回数、記事登録数など

### 3.3 記事分析関連KPI

#### 3.3.1 記事登録状況
- **総記事登録数**: 全ユーザーの累計記事登録数
- **監視中記事数**: 現在監視中の記事数
- **ユーザーあたりの平均記事数**: 総記事数 / アクティブユーザー数
- **記事登録数の推移**: 日次/週次/月次の登録数の推移グラフ

#### 3.3.2 分析実行状況
- **総分析実行回数**: 全期間の累計分析実行回数
- **今月の分析実行回数**: 今月の分析実行回数
- **先月の分析実行回数**: 先月の分析実行回数
- **前月比**: 今月 / 先月の分析実行回数の比較
- **分析実行数の推移**: 日次/週次/月次の分析実行数の推移グラフ
- **プラン別の分析実行回数**: プラン別の平均分析実行回数

#### 3.3.3 新規記事提案状況
- **総提案回数**: 全期間の累計提案回数（generation_idベース）
- **今月の提案回数**: 今月の提案回数
- **提案→記事作成転換数**: 提案から実際に記事を作成した数（将来的に実装）
- **提案転換率**: 記事作成数 / 提案回数（将来的に実装）

#### 3.3.4 サイト連携状況
- **GSC連携サイト数**: Google Search Consoleと連携しているサイト数
- **ユーザーあたりの平均連携サイト数**: 連携サイト数 / アクティブユーザー数
- **連携サイトのアクティブ率**: 過去30日以内にデータ取得したサイトの割合

### 3.4 その他のKPI

#### 3.4.1 通知状況
- **通知送信数**: 今月/先月の通知送信数
- **通知開封率**: 通知の開封率（将来的に実装）
- **通知チャネル別の内訳**: メール / Slack の送信数

#### 3.4.2 エラー・問題状況
- **APIエラー率**: 分析実行時のエラー発生率
- **GSC APIエラー数**: Google Search Console APIのエラー数
- **サポート問い合わせ数**: サポートへの問い合わせ件数（将来的に実装）

## 4. データ取得方法

### 4.1 データソース

以下のテーブルからデータを取得します：

- **users**: ユーザー情報、プラン情報、登録日時
- **plans**: プラン情報、価格情報
- **articles**: 記事登録情報、監視状況
- **analysis_runs**: 分析実行履歴
- **article_suggestions**: 新規記事提案履歴（generation_idベース）
- **sites**: GSC連携サイト情報
- **notifications**: 通知送信履歴
- **stripe_subscriptions** (Stripe API経由): サブスクリプション情報、MRR計算

### 4.2 集計クエリ例

#### ユーザー数集計
```sql
-- 総ユーザー数
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;

-- アクティブユーザー数（過去30日以内にログイン）
-- 注: 現在はログイン履歴テーブルがないため、最終ログイン日時の記録が必要

-- 新規登録ユーザー数（今月）
SELECT COUNT(*) FROM users 
WHERE deleted_at IS NULL 
  AND created_at >= DATE_TRUNC('month', NOW())
  AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
```

#### プラン別ユーザー数
```sql
SELECT 
  p.name,
  p.display_name,
  COUNT(u.id) as user_count
FROM plans p
LEFT JOIN users u ON u.plan_id = p.id AND u.deleted_at IS NULL
GROUP BY p.id, p.name, p.display_name
ORDER BY p.price_monthly;
```

#### 分析実行回数
```sql
-- 今月の分析実行回数
SELECT COUNT(*) FROM analysis_runs
WHERE created_at >= DATE_TRUNC('month', NOW())
  AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
```

#### MRR計算
```sql
-- プラン別のMRR
SELECT 
  p.name,
  p.display_name,
  COUNT(u.id) * p.price_monthly as mrr
FROM plans p
LEFT JOIN users u ON u.plan_id = p.id 
  AND u.deleted_at IS NULL
  AND u.plan_ends_at IS NULL  -- アクティブなサブスクリプションのみ
WHERE p.name != 'free'
GROUP BY p.id, p.name, p.display_name, p.price_monthly;
```

## 5. セキュリティ要件

### 5.1 アクセス制御

#### 推奨方法: 環境変数による管理者指定（シンプル・推奨）

管理者が1人の場合、環境変数でメールアドレスを指定する方法が最もシンプルで実装しやすいです。

**実装方法:**

1. **環境変数の設定**
   ```bash
   # .env.local または .env.production
   ADMIN_EMAIL=your-email@example.com
   ```

2. **認証チェック関数の実装**
   ```typescript
   // lib/admin-auth.ts
   import { auth } from "@/lib/auth";
   import { getUserById } from "@/lib/db/users";

   export async function requireAdmin(): Promise<boolean> {
     const session = await auth();
     
     if (!session?.userId) {
       return false;
     }
     
     const adminEmail = process.env.ADMIN_EMAIL;
     if (!adminEmail) {
       console.error("[Admin Auth] ADMIN_EMAIL is not set");
       return false;
     }
     
     const user = await getUserById(session.userId);
     return user?.email === adminEmail;
   }
   ```

3. **APIでの使用例**
   ```typescript
   // app/api/admin/dashboard/stats/route.ts
   import { requireAdmin } from "@/lib/admin-auth";
   
   export async function GET(request: NextRequest) {
     if (!await requireAdmin()) {
       return NextResponse.json(
         { error: "Unauthorized" },
         { status: 403 }
       );
     }
     // ... 管理者のみアクセス可能な処理
   }
   ```

**メリット:**
- 実装がシンプル
- データベース変更不要
- 環境変数で簡単に変更可能
- セキュリティ: 環境変数はGitにコミットされない

**デメリット:**
- 複数の管理者を追加する場合は環境変数を複数設定する必要がある

#### 代替方法: データベースカラムによる管理（将来的な拡張用）

将来的に複数の管理者を追加する可能性がある場合、`users` テーブルに `is_admin` カラムを追加する方法も検討できます。

**実装方法:**

1. **マイグレーション**
   ```sql
   ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false;
   CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = true;
   ```

2. **認証チェック関数**
   ```typescript
   export async function requireAdmin(): Promise<boolean> {
     const session = await auth();
     if (!session?.userId) return false;
     
     const user = await getUserById(session.userId);
     return user?.is_admin === true;
   }
   ```

**メリット:**
- 複数の管理者を柔軟に管理可能
- 管理者の追加・削除がデータベース操作で可能

**デメリット:**
- マイグレーションが必要
- 初期設定時に管理者フラグを設定する必要がある

#### 推奨: 環境変数方式を採用

管理者が1人の場合は、**環境変数方式を推奨**します。理由：
- 実装が簡単
- データベース変更不要
- セキュリティ面でも問題なし
- 将来的に複数管理者が必要になった場合、その時にデータベース方式に移行可能

- **認証チェック**: すべての管理画面APIで管理者権限をチェック
- **IP制限**: 必要に応じて特定IPからのみアクセス可能にする（オプション）

### 5.2 データ保護

- **個人情報の取り扱い**: メールアドレスなどの個人情報は必要最小限の表示
- **ログ記録**: 管理画面へのアクセスログを記録
- **監査ログ**: 管理者による重要な操作（ユーザー情報変更など）を記録

## 6. 実装方針

### 6.1 技術スタック

- **フロントエンド**: Next.js (既存のスタックと統一)
- **UIコンポーネント**: 既存のTailwind CSSスタイルを継承
- **データ可視化**: Chart.js または Recharts を使用
- **API**: Next.js API Routes

### 6.2 ディレクトリ構造

```
app/
  [locale]/
    admin/
      dashboard/
        page.tsx          # メインダッシュボード
        users/
          page.tsx        # ユーザー一覧・詳細
        subscriptions/
          page.tsx        # サブスクリプション管理
        analytics/
          page.tsx        # 分析状況
      layout.tsx          # 管理画面レイアウト（サイドバーなど）

api/
  admin/
    dashboard/
      stats/
        route.ts          # ダッシュボード統計API
      users/
        route.ts          # ユーザー一覧API
      subscriptions/
        route.ts          # サブスクリプション統計API
      analytics/
        route.ts          # 分析統計API
```

### 6.3 認証ミドルウェア

```typescript
// lib/admin-auth.ts
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";

/**
 * 現在のセッションが管理者かどうかをチェック
 * 環境変数 ADMIN_EMAIL で指定されたメールアドレスと一致する場合のみ管理者とみなす
 */
export async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  
  if (!session?.userId) {
    return false;
  }
  
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("[Admin Auth] ADMIN_EMAIL is not set");
    return false;
  }
  
  const user = await getUserById(session.userId);
  if (!user) {
    return false;
  }
  
  return user.email === adminEmail;
}

/**
 * 複数の管理者をサポートする場合（将来的な拡張用）
 */
export async function requireAdminMultiple(): Promise<boolean> {
  const session = await auth();
  
  if (!session?.userId) {
    return false;
  }
  
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  if (adminEmails.length === 0) {
    console.error("[Admin Auth] ADMIN_EMAILS is not set");
    return false;
  }
  
  const user = await getUserById(session.userId);
  if (!user) {
    return false;
  }
  
  return adminEmails.includes(user.email);
}
```

### 6.4 API実装例

```typescript
// app/api/admin/dashboard/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  // 管理者権限チェック
  if (!await requireAdmin()) {
    return NextResponse.json(
      { error: "Unauthorized. Admin access required." },
      { status: 403 }
    );
  }
  
  const supabase = createSupabaseClient();
  
  // KPIデータを取得
  const stats = await getDashboardStats(supabase);
  
  return NextResponse.json({ stats });
}
```

### 6.5 環境変数の設定

**開発環境 (`.env.local`):**
```bash
# 管理画面へのアクセス権限（あなたのメールアドレスを設定）
ADMIN_EMAIL=your-email@example.com
```

**本番環境 (Vercel環境変数):**
1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. **Settings** → **Environment Variables**
4. `ADMIN_EMAIL` を追加（値: あなたのメールアドレス）
5. 環境を選択（Production, Preview, Development）

**注意事項:**
- 環境変数はGitにコミットしない（`.env.local` は `.gitignore` に含まれている）
- 本番環境では必ずVercelの環境変数として設定する
- メールアドレスは正確に入力する（大文字小文字は区別される）
- このメールアドレスでログインしたユーザーのみ管理画面（`/admin/dashboard`）にアクセス可能

**アクセス方法:**
1. 通常通りログイン（Google OAuthまたはメール・パスワード）
2. ブラウザで `/admin/dashboard` にアクセス
3. 管理者権限があれば管理画面が表示される
4. 管理者権限がない場合は通常のダッシュボードにリダイレクトされる

## 7. UI/UX設計

### 7.1 ダッシュボードレイアウト

- **ヘッダー**: ロゴ、現在の日時、ログアウトボタン
- **サイドバー**: 
  - ダッシュボード
  - ユーザー管理
  - サブスクリプション管理
  - 分析状況
  - 設定
- **メインコンテンツエリア**: KPIカードとグラフ

### 7.2 KPIカード

各KPIをカード形式で表示：
- **数値**: 大きなフォントで強調
- **前月比**: 増減を色分け（緑: 増加、赤: 減少）
- **アイコン**: 視覚的な識別を容易に

### 7.3 グラフ・チャート

- **時系列グラフ**: ユーザー登録数、分析実行数の推移
- **円グラフ**: プラン別ユーザー数の内訳
- **棒グラフ**: プラン別のMRR比較
- **テーブル**: 詳細データの一覧表示

### 7.4 フィルター機能

- **期間選択**: 今日、今週、今月、先月、カスタム期間
- **プラン別フィルター**: 特定プランのみ表示
- **エクスポート**: CSV/Excel形式でのデータエクスポート（将来的に実装）

## 8. 実装フェーズ

### Phase 1: 基本ダッシュボード（MVP）
- [ ] 管理者認証システム
- [ ] 基本KPI表示（ユーザー数、プラン別ユーザー数、分析実行回数）
- [ ] シンプルなダッシュボードUI

### Phase 2: 詳細統計
- [ ] 時系列グラフの実装
- [ ] MRR計算と表示
- [ ] プラン別の詳細統計

### Phase 3: ユーザー管理機能
- [ ] ユーザー一覧・検索
- [ ] ユーザー詳細表示
- [ ] プラン変更機能（管理者による手動変更）

### Phase 4: 高度な分析
- [ ] エクスポート機能
- [ ] カスタムレポート生成
- [ ] アラート機能（異常値検知）

## 9. データ更新頻度

- **リアルタイム**: ユーザー数、アクティブユーザー数など
- **1時間ごと**: 分析実行回数、記事登録数など
- **1日1回**: MRR、ARRなどの集計値（バッチ処理）

## 10. パフォーマンス考慮事項

- **キャッシュ**: 頻繁にアクセスされる統計データはキャッシュ（Redis推奨）
- **ページネーション**: 大量データの一覧表示はページネーション実装
- **インデックス**: 集計クエリで使用するカラムにインデックスを設定
- **非同期処理**: 重い集計処理はバックグラウンドジョブで実行

## 11. 今後の拡張

- **A/Bテスト結果の可視化**: 機能のA/Bテスト結果を管理画面で確認
- **ユーザーセグメント分析**: ユーザーをセグメント別に分析
- **予測分析**: 機械学習を使った将来の予測（ユーザー数、MRRなど）
- **自動レポート**: 定期的にメールでレポートを送信

## 12. 参考資料

- [Stripe Dashboard](https://dashboard.stripe.com/): サブスクリプション管理の参考
- [Google Analytics](https://analytics.google.com/): データ可視化の参考
- [Supabase Dashboard](https://app.supabase.com/): 管理画面UIの参考
