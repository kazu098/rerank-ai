# 本番デプロイ手順（Vercel + Cloudflare DNS）

## 前提条件

- [ ] GitHubリポジトリにコードがプッシュされている
- [ ] Vercelアカウントを作成済み
- [ ] Cloudflareアカウントを作成済み（ドメイン管理用）
- [ ] ドメインを取得済み（または取得予定）

## ステップ1: Vercelでプロジェクトを設定

### 1.1 既存プロジェクトの整理

**重要**: 複数のプロジェクトが作成されている場合は、1つに統一してください。

推奨: **`rerank-ai`** を本番環境として使用

**不要なプロジェクトの削除**:
1. Vercelダッシュボードで各プロジェクトを開く
2. Settings → General → Delete Project
3. 以下のプロジェクトは削除を検討:
   - `rerank-ai-9wg6`
   - `rerank-ai-app`
   - `rerank-ai-notm`
   - `rerank-ai-prd`
   - `rerank-ai-production`


### 1.2 GitHub連携の設定（自動デプロイ用）

**`rerank-ai` プロジェクトで以下を設定**:

1. **Settings → Git**
   - Connected Git Repository: `kazu098/rerank-ai` が連携されているか確認
   - 連携されていない場合:
     - 「Connect Git Repository」をクリック
     - GitHubリポジトリ `kazu098/rerank-ai` を選択
     - 権限を付与
   - Production Branch: `main` に設定
   - Preview Branches: すべてのブランチ（デフォルト）

2. **自動デプロイの動作**:
   - **PR作成時**: プレビューデプロイが自動的に作成され、PRにコメントとしてプレビューURLが追加されます
   - **mainブランチへのマージ時**: 本番デプロイが自動的に実行されます

### 1.3 プロジェクト設定の確認

1. **Settings → General**
   - Project Name: `rerank-ai`（変更不要）
   - Framework Preset: Next.js（自動検出）
   - Root Directory: `./`（デフォルト）
   - Build Command: `npm run build`（デフォルト）
   - Output Directory: `.next`（デフォルト）
   - Install Command: `npm install`（デフォルト）

### 1.3 環境変数を設定

**重要**: ドメインをまだ取得していない場合でも、Vercelは自動的に `.vercel.app` のサブドメインを割り当てます。まずはそのURLを使って環境変数を設定し、後でドメインを取得したら更新します。

#### デプロイ前の環境変数設定（ドメイン未取得の場合）

1. **まずデプロイを実行**（環境変数なしでも可能）
2. デプロイ完了後、Vercelが自動的に割り当てるURLを確認
   - 例: `rerank-ai-xxxxx.vercel.app`
3. そのURLを使って環境変数を設定

「Environment Variables」セクションで以下を追加:

```env
# NextAuth.js
# 注意: デプロイ後にVercelが割り当てるURLを使用
# 例: NEXTAUTH_URL=https://rerank-ai-xxxxx.vercel.app
NEXTAUTH_URL=https://your-project-name.vercel.app
NEXTAUTH_SECRET=<openssl rand -base64 32で生成>
GOOGLE_CLIENT_ID=<Google Cloud Consoleから取得>
GOOGLE_CLIENT_SECRET=<Google Cloud Consoleから取得>

# Serper API（本番環境では必須）
SERPER_API_KEY=<Serper.devから取得>
PREFER_SERPER_API=true

# LLM API
LLM_PROVIDER=gemini
GEMINI_API_KEY=<Google AI Studioから取得>
GEMINI_MODEL=gemini-2.0-flash-lite

# Resend
RESEND_API_KEY=<Resendから取得>
# ドメイン未取得の場合は、Resendの検証済みドメインを使用
# または後で更新（Resendはドメイン検証が必要な場合あり）
RESEND_FROM_EMAIL=noreply@your-verified-domain.com
```

**環境変数の設定手順**:

1. Vercelダッシュボード → プロジェクト → Settings → Environment Variables
2. 各環境変数を追加
3. **重要**: `NEXTAUTH_URL` はデプロイ後に確認したVercelのURLを使用
4. **環境を選択**:
   - **Production**: mainブランチの本番デプロイ用
   - **Preview**: PRのプレビューデプロイ用
   - **Development**: ローカル開発用（通常は設定不要）
5. 「Save」をクリック
6. 環境変数を更新したら、再デプロイが必要な場合があります

**注意**: 
- Production環境とPreview環境で異なる環境変数を設定できます
- PRのプレビューデプロイでは、Preview環境の環境変数が使用されます
- 本番デプロイでは、Production環境の環境変数が使用されます

#### ドメイン取得後の更新手順

1. ドメインを取得（Cloudflare等）
2. Vercelでカスタムドメインを追加（ステップ2を参照）
3. 環境変数を更新:
   - `NEXTAUTH_URL`: カスタムドメインのURLに更新
   - `RESEND_FROM_EMAIL`: カスタムドメインのメールアドレスに更新（Resendで検証後）
4. Google OAuthのリダイレクトURIを更新（ステップ3を参照）

### 1.4 デプロイ

「Deploy」ボタンをクリックしてデプロイを開始

**注意**: 初回デプロイ時は環境変数が設定されていなくてもデプロイは可能です。デプロイ後に環境変数を設定し、必要に応じて再デプロイしてください。

---

## ステップ2: ドメインの設定

### 2.1 Cloudflareでドメインを管理

1. [Cloudflare](https://www.cloudflare.com/) にログイン
2. 「Add a Site」をクリック
3. ドメインを入力してスキャン
4. プランを選択（無料プランでOK）
5. ネームサーバーを更新（ドメイン登録業者で設定）

### 2.2 Vercelでカスタムドメインを追加

1. Vercelダッシュボード → プロジェクト → Settings → Domains
2. 「Add Domain」をクリック
3. ドメインを入力（例: `rerank-ai.com`）
4. VercelがDNS設定を提案します

### 2.3 CloudflareでDNSレコードを設定

Cloudflareダッシュボード → DNS → Records で以下を追加:

#### 方法1: CNAMEレコード（推奨）

```
Type: CNAME
Name: @ (または www)
Target: cname.vercel-dns.com
Proxy status: Proxied (オレンジの雲)
```

#### 方法2: Aレコード

```
Type: A
Name: @
IPv4 address: 76.76.21.21
Proxy status: Proxied
```

**注意**: Vercelが提供するIPアドレスを使用してください（Vercelダッシュボードで確認可能）

### 2.4 SSL証明書の確認

- Vercelは自動的にSSL証明書を発行します
- 数分〜数時間で有効になります
- Cloudflareの「SSL/TLS」設定は「Full」または「Full (strict)」に設定

---

## ステップ3: Google OAuth設定の更新

### 3.1 Google Cloud ConsoleでリダイレクトURIを追加

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 「APIとサービス」→「認証情報」に移動
3. OAuth 2.0クライアントIDを編集
4. 「承認済みのリダイレクトURI」に追加:
   ```
   https://your-domain.com/api/auth/callback/google
   ```
5. 保存

---

## ステップ4: 動作確認

### 4.1 基本動作確認

1. 本番環境のURLにアクセス
2. Googleアカウントでログイン
3. 分析機能をテスト

### 4.2 確認項目

- [ ] OAuth認証が正常に動作する
- [ ] GSC APIからデータが取得できる
- [ ] 競合URL抽出が正常に動作する（Serper API使用）
- [ ] LLM分析が正常に動作する
- [ ] 通知機能が正常に動作する

---

## ステップ5: 自動デプロイの設定

### 5.1 GitHub連携（既に設定済みの場合）

- `main`ブランチへのプッシュで自動デプロイされます
- プルリクエストでプレビューデプロイが作成されます

### 5.2 ブランチ戦略

- **main**: 本番環境に自動デプロイ
- **develop**: ステージング環境（オプション）
- **feature/***: プレビュー環境

---

## トラブルシューティング

### デプロイが失敗する場合

1. **ビルドログを確認**
   - Vercelダッシュボード → Deployments → 失敗したデプロイ → Build Logs

2. **環境変数を確認**
   - すべての環境変数が正しく設定されているか確認
   - 特に `NEXTAUTH_URL` が本番環境のURLになっているか確認

3. **依存関係の問題**
   ```bash
   # ローカルでビルドをテスト
   npm run build
   ```

### Playwright関連のエラー

- 本番環境では `PREFER_SERPER_API=true` を設定してください
- PlaywrightはVercelのサーバーレス環境では実行時間制限があります

### OAuth認証が失敗する場合

1. **リダイレクトURIを確認**
   - Google Cloud Consoleで正しいURIが設定されているか確認
   - `NEXTAUTH_URL` が正しく設定されているか確認

2. **環境変数を確認**
   - `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が正しいか確認

### DNS設定が反映されない場合

- DNSの反映には数分〜48時間かかる場合があります
- Cloudflareの「DNS」設定で「Proxy status」が「Proxied」になっているか確認

---

## コスト管理

### 月間コスト見積もり（100ユーザー想定）

- **Vercel**: 無料（Hobbyプラン）
- **Serper API**: 約450円/月（100ユーザー × 3リクエスト × 1.5円）
- **Gemini API**: 約8円/月（100ユーザー × 0.08円）
- **Resend**: 無料枠内（月間3,000通）
- **合計**: 約458円/月

### コスト最適化のヒント

1. **Serper APIの使用頻度を監視**
   - VercelダッシュボードでAPI呼び出しを確認
   - 必要に応じてキャッシュを実装

2. **Gemini APIの使用量を監視**
   - Google AI Studioで使用量を確認
   - 無料枠を超えないように注意

---

## 次のステップ

1. **監視の設定**
   - エラーログの監視（Sentry等）
   - アナリティクスの設定（Google Analytics等）

2. **パフォーマンス最適化**
   - 画像の最適化
   - コード分割の最適化

3. **セキュリティの強化**
   - レート制限の実装
   - CSRF対策の確認

---

## 参考リンク

- [Vercel Documentation](https://vercel.com/docs)
- [Cloudflare DNS Documentation](https://developers.cloudflare.com/dns/)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Serper API Documentation](https://serper.dev/api-docs)

