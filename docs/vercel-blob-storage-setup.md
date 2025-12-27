# Vercel Blob Storage セットアップガイド

## 概要

詳細データ（LLM分析の詳細）を一時保存するために、Vercel Blob Storageを使用します。

## 必要な設定

### 1. Vercelダッシュボードでの設定

1. **Blob Storageの作成**
   - Vercelダッシュボードにログイン
   - プロジェクトを選択
   - 「Storage」タブをクリック
   - 「Create Database」をクリック
   - 「Blob」を選択
   - 名前を設定（例: `rerank-ai-blob`）
   - **リージョンを選択**（重要）
   - 「Create」をクリック

   **リージョン選択の推奨**:
   - **日本ユーザーが主な場合**: `Northeast Asia (Tokyo)` または `Southeast Asia (Singapore)`
   - **グローバル展開の場合**: `US East (Washington)` または `US West (San Francisco)`（デフォルト、最も安定）
   - **ヨーロッパユーザーが主な場合**: `Europe (Frankfurt)` または `Europe (London)`
   
   **注意**: リージョンは作成後に変更できないため、慎重に選択してください。

2. **プロジェクトとの連携**
   - 作成したBlob Storageの詳細ページで「Connect」ボタンをクリック
   - プロジェクトを選択して連携

3. **環境変数の確認**
   - Blob Storageの詳細ページで「.env.local」タブを開く
   - 環境変数が自動的に設定されていることを確認
   - 通常、以下の環境変数が自動設定されます:
     - `BLOB_READ_WRITE_TOKEN` (自動設定)

### 2. 環境変数の設定

**ローカル開発環境**:
- `.env.local`ファイルに環境変数を追加（Vercelダッシュボードからコピー）

**本番環境**:
- Vercelダッシュボードの「Settings」→「Environment Variables」で設定
- または、Blob Storage作成時に自動設定される

### 3. コード側の設定

**既に実装済み**:
- ✅ `@vercel/blob`パッケージのインストール
- ✅ `lib/db/analysis-results.ts`での使用
- ✅ 詳細データの保存・取得機能

**注意事項**:
- 現在の実装では`access: "public"`を使用しているため、URLに直接アクセス可能
- プライベートアクセスが必要な場合は、認証トークンを使用する必要があります

## 動作確認

### 1. ローカルでの確認

```bash
# 環境変数を設定
echo "BLOB_READ_WRITE_TOKEN=your-token" >> .env.local

# 開発サーバーを起動
npm run dev
```

### 2. 本番環境での確認

1. VercelダッシュボードでBlob Storageが作成されていることを確認
2. 環境変数が設定されていることを確認
3. 分析を実行して、詳細データが保存されることを確認

## トラブルシューティング

### エラー: `BLOB_READ_WRITE_TOKEN` is not defined

**原因**: 環境変数が設定されていない

**解決方法**:
1. VercelダッシュボードでBlob Storageが作成されていることを確認
2. 環境変数が設定されていることを確認
3. ローカル開発環境の場合は`.env.local`に追加

### エラー: Failed to save detailed data to blob storage

**原因**: Blob Storageへのアクセス権限がない、またはネットワークエラー

**解決方法**:
1. `BLOB_READ_WRITE_TOKEN`が正しく設定されていることを確認
2. VercelダッシュボードでBlob Storageの状態を確認
3. ネットワーク接続を確認

### エラー: Failed to fetch blob

**原因**: ストレージキーが無効、または有効期限切れ

**解決方法**:
1. ストレージキーが正しいことを確認
2. 有効期限が切れていないことを確認（30日間）
3. Blob StorageのURLが正しいことを確認

## リージョン選択の詳細ガイド

### リージョン選択の考慮事項

1. **ユーザーの所在地**
   - 主なユーザーがいる地域に近いリージョンを選ぶことで、データの読み書き速度が向上します
   - レイテンシが低くなり、ユーザー体験が向上します

2. **データのレイテンシ**
   - アプリケーションが他のサービス（Supabase、GSC API等）と連携している場合、それらのサービスが配置されているリージョンに近い場所を選ぶと、通信の遅延を最小限に抑えられます
   - 現在のプロジェクトではSupabaseを使用しているため、Supabaseのリージョンも考慮してください

3. **データの規制とコンプライアンス**
   - 特定の国や地域では、データの保存場所に関する法律や規制が存在する場合があります
   - これらの規制を遵守するために、適切なリージョンを選択する必要があります

4. **コスト**
   - リージョンによってコストが異なる場合があります（通常は同じ）
   - データ転送コストも考慮してください

### このプロジェクトでの推奨リージョン

**推奨: `Northeast Asia (Tokyo)` または `US East (Washington)`**

**理由**:
1. **日本ユーザーが主な場合**: `Northeast Asia (Tokyo)` を推奨
   - 日本からのアクセスが最も高速
   - タイムゾーン設定で`Asia/Tokyo`が使用されている可能性がある

2. **グローバル展開の場合**: `US East (Washington)` を推奨
   - Vercelのデフォルトリージョンで最も安定
   - 世界中からのアクセスに対してバランスが良い
   - 他のVercelサービスとの統合が最適化されている

3. **Supabaseのリージョンと合わせる**
   - Supabaseのリージョンが`Asia Pacific (Tokyo)`の場合、`Northeast Asia (Tokyo)`を推奨
   - データベースとBlob Storageが同じリージョンにあると、レイテンシが最小化されます

### リージョン一覧（主要）

- **Northeast Asia (Tokyo)**: 日本、韓国向け
- **Southeast Asia (Singapore)**: 東南アジア向け
- **US East (Washington)**: 米国東海岸、デフォルト
- **US West (San Francisco)**: 米国西海岸
- **Europe (Frankfurt)**: ヨーロッパ向け
- **Europe (London)**: イギリス向け

### 注意事項

⚠️ **重要**: リージョンは作成後に変更できません。慎重に選択してください。

## 参考資料

- [Vercel Blob Storage Documentation](https://vercel.com/docs/storage/vercel-blob)
- [@vercel/blob Package](https://www.npmjs.com/package/@vercel/blob)
- [Vercel Blob Storage Regions](https://vercel.com/docs/storage/vercel-blob/regions)

