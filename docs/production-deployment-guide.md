# 本番デプロイガイド

## 現在の実装状況

### ✅ 実装済み機能
- モード1: 順位下落を検知して修正
- GSC API連携（OAuth 2.0認証）
- 競合URL抽出（Playwright + Serper APIフォールバック）
- 記事スクレイピング
- 差分分析（基本 + LLMによる意味レベル分析）
- 通知機能（Resend）
- キーワード優先順位付け
- キーワード推移グラフ表示

### ⚠️ 本番デプロイ前に確認すべき項目

1. **環境変数の設定**
   - すべてのAPIキーが設定されているか
   - 本番環境用のOAuthリダイレクトURIが設定されているか

2. **Playwrightの制約**
   - サーバーレス環境では実行時間制限がある
   - ブラウザバイナリのサイズが大きい（~300MB）

3. **コスト最適化**
   - Serper APIの使用頻度
   - LLM APIのコスト（Gemini 2.0 Flash Lite推奨）

## デプロイ方法の比較

### 1. Vercel（推奨：Next.jsに最適化）

#### メリット
- ✅ Next.jsに最適化されており、設定が簡単
- ✅ 自動デプロイ（GitHub連携）
- ✅ 無料枠あり（Hobbyプラン）
- ✅ エッジ関数で高速
- ✅ 環境変数の管理が簡単

#### デメリット
- ⚠️ Playwrightの実行時間制限（10秒）
- ⚠️ サーバーレス関数のタイムアウト制限
- ⚠️ ブラウザバイナリのサイズ制限

#### 推奨設定
```bash
# Vercel CLIでデプロイ
npm i -g vercel
vercel
```

**環境変数の設定**:
- Vercelダッシュボード → Settings → Environment Variables
- すべてのAPIキーを設定

**Playwright対応**:
- VercelではPlaywrightのブラウザバイナリを別途設定が必要
- または、Serper APIを優先使用（`PREFER_SERPER_API=true`）

#### コスト
- **Hobby（無料）**: 個人プロジェクト向け
- **Pro（$20/月）**: チーム向け、より多くのリソース

---

### 2. Cloudflare Pages + Workers

#### メリット
- ✅ 無料枠が大きい（100,000リクエスト/日）
- ✅ グローバルCDNで高速
- ✅ 自動デプロイ（GitHub連携）
- ✅ Workersでサーバーレス関数実行
- ✅ ドメイン管理が簡単（Cloudflare DNS）

#### デメリット
- ⚠️ Next.jsの一部機能が制限される可能性
- ⚠️ Playwrightの実行環境が限定的
- ⚠️ 環境変数の設定がやや複雑

#### 推奨設定
```bash
# Cloudflare Pagesでデプロイ
# GitHubリポジトリを連携
# ビルドコマンド: npm run build
# 出力ディレクトリ: .next
```

**環境変数の設定**:
- Cloudflareダッシュボード → Pages → プロジェクト → Settings → Environment Variables

**Playwright対応**:
- Cloudflare WorkersではPlaywrightの実行が困難
- **推奨**: Serper APIを優先使用（`PREFER_SERPER_API=true`）

#### コスト
- **無料枠**: 100,000リクエスト/日
- **Paid（$5/月）**: より多くのリソース

---

### 3. Google Cloud Platform (GCP)

#### 3-1. Cloud Run（推奨：サーバーレスコンテナ）

##### メリット
- ✅ サーバーレスで自動スケーリング
- ✅ Playwrightの実行が可能（コンテナ環境）
- ✅ 実行時間制限が緩い（60分）
- ✅ 従量課金（使用した分だけ）

##### デメリット
- ⚠️ Dockerfileの作成が必要
- ⚠️ 設定がやや複雑
- ⚠️ コールドスタートがある

##### 推奨設定
```dockerfile
# Dockerfile
FROM node:18-alpine

# Playwright用の依存関係をインストール
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**デプロイコマンド**:
```bash
# GCP CLIでデプロイ
gcloud run deploy rerank-ai \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated
```

**環境変数の設定**:
```bash
gcloud run services update rerank-ai \
  --set-env-vars="NEXTAUTH_URL=https://your-domain.com,NEXTAUTH_SECRET=..."
```

#### コスト
- **無料枠**: 200万リクエスト/月
- **従量課金**: $0.40/100万リクエスト

---

#### 3-2. App Engine（従来型）

##### メリット
- ✅ 自動スケーリング
- ✅ 管理が簡単
- ✅ 無料枠あり

##### デメリット
- ⚠️ Playwrightの実行が困難
- ⚠️ 実行時間制限がある

---

#### 3-3. Compute Engine（VM）

##### メリット
- ✅ 完全な制御が可能
- ✅ Playwrightの実行が容易
- ✅ 長時間実行可能

##### デメリット
- ⚠️ サーバー管理が必要
- ⚠️ コストが高い（常時起動）
- ⚠️ スケーリングが手動

---

## 推奨デプロイ方法

### MVP段階（現在）

**推奨: Vercel + Serper API優先使用**

理由:
1. 設定が最も簡単
2. 無料枠で開始可能
3. Playwrightの制約をSerper APIで回避
4. 自動デプロイが簡単

**設定**:
```env
PREFER_SERPER_API=true  # 本番環境でSerper APIを優先
```

**コスト**:
- Vercel: 無料（Hobbyプラン）
- Serper API: 約1.5円/リクエスト（1回の分析で最大3リクエスト = 約4.5円）

---

### スケール段階（将来）

**推奨: GCP Cloud Run + Playwright**

理由:
1. Playwrightの実行が可能
2. コスト最適化（ブラウジングツールは無料）
3. スケーリングが自動
4. 実行時間制限が緩い

**設定**:
```env
PREFER_SERPER_API=false  # Playwrightを優先、CAPTCHA時のみSerper API
```

**コスト**:
- Cloud Run: 従量課金（無料枠あり）
- Playwright: 無料
- Serper API: フォールバック時のみ（約1.5円/リクエスト）

---

## デプロイ手順（Vercel推奨）

### 1. ドメインの取得

推奨ドメイン取得サービス:
- **Cloudflare Registrar**: ドメイン管理が簡単、価格も安い
- **Google Domains**: GCPと統合しやすい
- **Namecheap**: 価格が安い

### 2. Vercelでのデプロイ

```bash
# 1. Vercel CLIをインストール
npm i -g vercel

# 2. ログイン
vercel login

# 3. プロジェクトをデプロイ
vercel

# 4. 本番環境にデプロイ
vercel --prod
```

### 3. 環境変数の設定

Vercelダッシュボードで以下を設定:
- `NEXTAUTH_URL`: 本番環境のURL
- `NEXTAUTH_SECRET`: ランダムな文字列
- `GOOGLE_CLIENT_ID`: Google OAuth 2.0
- `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0
- `SERPER_API_KEY`: Serper API
- `PREFER_SERPER_API`: `true`
- `LLM_PROVIDER`: `gemini`
- `GEMINI_API_KEY`: Gemini API
- `GEMINI_MODEL`: `gemini-2.0-flash-lite`
- `RESEND_API_KEY`: Resend API
- `RESEND_FROM_EMAIL`: 送信元メールアドレス

### 4. ドメインの設定

1. Vercelダッシュボード → プロジェクト → Settings → Domains
2. カスタムドメインを追加
3. DNS設定をCloudflareで行う（AレコードまたはCNAME）

### 5. Google OAuth設定の更新

1. Google Cloud Console → 認証情報
2. OAuth 2.0クライアントIDを編集
3. 承認済みのリダイレクトURIに追加:
   - `https://your-domain.com/api/auth/callback/google`

### 6. 動作確認

1. 本番環境のURLにアクセス
2. Googleアカウントでログイン
3. 分析機能をテスト

---

## 本番デプロイ前のチェックリスト

### 必須項目
- [ ] すべての環境変数が設定されている
- [ ] Google OAuthのリダイレクトURIが本番環境用に設定されている
- [ ] `PREFER_SERPER_API=true`が設定されている（Vercelの場合）
- [ ] ドメインが設定されている
- [ ] SSL証明書が有効（Vercel/Cloudflareは自動）

### 推奨項目
- [ ] エラーログの監視設定（Sentry等）
- [ ] アナリティクスの設定（Google Analytics等）
- [ ] バックアップ戦略（データベース使用時）

### テスト項目
- [ ] OAuth認証が正常に動作する
- [ ] GSC APIからデータが取得できる
- [ ] 競合URL抽出が正常に動作する
- [ ] LLM分析が正常に動作する
- [ ] 通知機能が正常に動作する

---

## コスト見積もり（月間）

### 小規模（月間100ユーザー、各1回分析）

**Vercel + Serper API優先**:
- Vercel: 無料（Hobbyプラン）
- Serper API: 100ユーザー × 3リクエスト × 1.5円 = **450円**
- Gemini API: 100ユーザー × 0.08円 = **8円**
- Resend: 無料枠内（月間3,000通）
- **合計: 約458円/月**

**GCP Cloud Run + Playwright優先**:
- Cloud Run: 無料枠内
- Playwright: 無料
- Serper API: フォールバック時のみ（推定10% = 30リクエスト × 1.5円 = **45円**）
- Gemini API: 100ユーザー × 0.08円 = **8円**
- Resend: 無料枠内
- **合計: 約53円/月**

### 中規模（月間1,000ユーザー、各1回分析）

**Vercel + Serper API優先**:
- Vercel: $20/月（Proプラン）
- Serper API: 1,000ユーザー × 3リクエスト × 1.5円 = **4,500円**
- Gemini API: 1,000ユーザー × 0.08円 = **80円**
- Resend: 無料枠内
- **合計: 約4,600円/月**

**GCP Cloud Run + Playwright優先**:
- Cloud Run: 従量課金（推定500円/月）
- Playwright: 無料
- Serper API: フォールバック時のみ（推定10% = 300リクエスト × 1.5円 = **450円**）
- Gemini API: 1,000ユーザー × 0.08円 = **80円**
- Resend: 無料枠内
- **合計: 約1,030円/月**

---

## 結論

### 現在の段階（MVP）での推奨

**Vercel + Serper API優先使用**

理由:
1. 設定が最も簡単
2. 無料枠で開始可能
3. Playwrightの制約を回避
4. 自動デプロイが簡単
5. ドメイン管理が簡単（Cloudflare DNSと連携可能）

### 将来のスケール時

**GCP Cloud Run + Playwright優先使用**

理由:
1. コスト最適化（Playwrightは無料）
2. スケーリングが自動
3. 実行時間制限が緩い
4. Playwrightの実行が可能

---

## 次のステップ

1. **ドメインを取得**（Cloudflare Registrar推奨）
2. **Vercelでデプロイ**（無料枠で開始）
3. **環境変数を設定**
4. **動作確認**
5. **ユーザーフィードバックを収集**
6. **スケール時にGCP Cloud Runに移行を検討**

