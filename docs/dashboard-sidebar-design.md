# ダッシュボードサイドバー設計

## 設計方針

機能が増えてくることを想定し、左サイドバーにナビゲーションメニューを配置する設計を推奨します。

## レイアウト構成

```
┌─────────────────────────────────────────┐
│  Header (固定)                          │
│  [ReRank AI] [分析を開始] [ユーザー名]   │
├──────────┬──────────────────────────────┤
│          │                              │
│ Sidebar  │  Main Content                │
│ (固定)   │  (動的)                      │
│          │                              │
│ - 概要   │  [統計情報カード]            │
│ - 記事   │  [記事一覧]                  │
│ - 通知   │  [未読通知]                  │
│ - 設定   │                              │
│ - 課金   │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

## サイドバーメニュー項目

### 現在実装済み・実装予定の機能

1. **概要（Dashboard）** - `/dashboard`
   - 統計情報（登録記事数、監視中、分析実行回数）
   - 記事一覧（最新の分析結果付き）
   - 未読通知一覧

2. **記事（Articles）** - `/dashboard/articles`
   - 記事一覧ページ（詳細なフィルタリング・ソート機能）
   - 記事詳細ページ - `/dashboard/articles/[id]`
     - 分析結果履歴
     - 分析結果詳細表示
     - 通知設定
     - 修正済みフラグ

3. **通知（Notifications）** - `/dashboard/notifications`
   - 通知履歴一覧（全通知、未読/既読フィルタ）
   - 通知詳細表示
   - 既読機能

4. **設定（Settings）** - `/dashboard/settings`
   - 通知設定（メール、Slack等）
   - アラート設定のカスタマイズ（将来）
   - タイムゾーン設定
   - ロケール設定

5. **課金（Billing）** - `/dashboard/billing`（将来）
   - プラン情報
   - 利用状況
   - プラン変更
   - 決済情報

## 実装方針

### 1. 共通レイアウトコンポーネント

`app/[locale]/dashboard/layout.tsx` を作成し、サイドバーを含む共通レイアウトを実装

```typescript
// app/[locale]/dashboard/layout.tsx
export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
```

### 2. サイドバーコンポーネント

- アクティブなページをハイライト
- アイコン付きメニュー項目
- レスポンシブ対応（モバイルではハンバーガーメニュー）

### 3. ページ構成

```
app/[locale]/dashboard/
├── layout.tsx          # 共通レイアウト（サイドバー含む）
├── page.tsx            # 概要ページ（現在のダッシュボード）
├── articles/
│   ├── page.tsx        # 記事一覧ページ
│   └── [id]/
│       └── page.tsx    # 記事詳細ページ
├── notifications/
│   └── page.tsx        # 通知履歴ページ
├── settings/
│   └── page.tsx        # 設定ページ
└── billing/
    └── page.tsx        # 課金管理ページ（将来）
```

## メリット

1. **拡張性**: 新しい機能を追加する際、サイドバーに項目を追加するだけ
2. **一貫性**: 全ページで同じナビゲーション構造
3. **ユーザビリティ**: どこにいても他の機能にアクセス可能
4. **スケーラビリティ**: 機能が増えても構造が崩れない

## 実装優先順位

1. **Phase 1**: サイドバーと共通レイアウトの実装
   - `dashboard/layout.tsx` の作成
   - サイドバーコンポーネントの実装
   - 現在のダッシュボードページを `dashboard/page.tsx` に移動

2. **Phase 2**: 既存機能の整理
   - 記事一覧を `dashboard/articles/page.tsx` に分離（オプション）
   - 通知履歴を `dashboard/notifications/page.tsx` に分離

3. **Phase 3**: 新機能の追加
   - 記事詳細ページ
   - 設定ページ
   - 課金管理ページ

