# セットアップ手順

## 前提条件

- Node.js 18以上
- npm または yarn
- Google Cloud Console アカウント
- Vercel アカウント（デプロイ時）

## 1. 依存関係のインストール

```bash
npm install
```

## 2. 環境変数の設定

**重要**: `.env.local` ファイルをプロジェクトルートに作成してください（このファイルはGitにコミットされません）。

以下のコマンドでテンプレートから作成できます：

```bash
cat > .env.local << 'EOF'
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
# 生成方法: openssl rand -base64 32

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Supabase（後で追加）
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Gemini API（後で追加）
GEMINI_API_KEY=your-gemini-api-key

# Resend（後で追加）
RESEND_API_KEY=your-resend-api-key
EOF
```

または、手動で `.env.local` ファイルを作成し、以下の環境変数を設定してください：

```env
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
# 生成方法: openssl rand -base64 32

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Supabase（後で追加）
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Gemini API（後で追加）
GEMINI_API_KEY=your-gemini-api-key

# Resend（後で追加）
RESEND_API_KEY=your-resend-api-key
```

## 3. Google Cloud Console の設定

### 3.1 プロジェクトの作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成

### 3.2 OAuth 2.0認証情報の作成

1. 「APIとサービス」→「認証情報」に移動
2. 「認証情報を作成」→「OAuth クライアント ID」を選択
3. アプリケーションの種類: 「ウェブアプリケーション」
4. 承認済みのリダイレクト URI:
   - `http://localhost:3000/api/auth/callback/google` (開発環境)
   - `https://your-domain.vercel.app/api/auth/callback/google` (本番環境)
5. スコープ: `https://www.googleapis.com/auth/webmasters.readonly`

### 3.3 Search Console API の有効化

1. 「APIとサービス」→「ライブラリ」に移動
2. 「Google Search Console API」を検索して有効化

### 3.4 認証情報の取得

作成したOAuth 2.0認証情報から以下を取得：
- クライアント ID → `GOOGLE_CLIENT_ID`
- クライアント シークレット → `GOOGLE_CLIENT_SECRET`

## 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` にアクセス

## 5. 動作確認

### 5.1 OAuth認証の確認

1. `/api/auth/signin` にアクセス
2. Googleアカウントでログイン
3. リダイレクトが正常に動作することを確認

### 5.2 GSC API連携の確認

認証後、以下のAPIエンドポイントをテスト：

- 時系列データ取得:
  ```
  GET /api/gsc/rank-data?siteUrl=https://example.com&pageUrl=/article&startDate=2024-01-01&endDate=2024-01-31
  ```

- キーワードデータ取得:
  ```
  GET /api/gsc/keywords?siteUrl=https://example.com&pageUrl=/article&startDate=2024-01-01&endDate=2024-01-31
  ```

## トラブルシューティング

### OAuth認証が失敗する場合

- リダイレクトURIが正しく設定されているか確認
- 環境変数 `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が正しく設定されているか確認
- Google Cloud ConsoleでSearch Console APIが有効化されているか確認

### GSC APIからデータが取得できない場合

- アクセストークンが正しく取得されているか確認
- サイトURLが正しい形式（`https://example.com` または `sc-domain:example.com`）か確認
- Search Consoleでサイトが検証されているか確認

## 次のステップ


