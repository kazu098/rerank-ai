# 本番環境の環境変数チェックリスト

## NextAuth.jsの設定エラー（`error=Configuration`）の原因

本番環境でGoogle認証時に`error=Configuration`エラーが発生する場合、以下の環境変数が正しく設定されているか確認してください。

## 必須環境変数

### 1. NextAuth.js設定

```bash
# 必須: 認証シークレット（どちらか一方でOK）
AUTH_SECRET=your-secret-key-here
# または
NEXTAUTH_SECRET=your-secret-key-here

# 必須: 本番環境のURL（プロトコル含む）
NEXTAUTH_URL=https://rerank-ai.com
# または
NEXTAUTH_URL=https://www.rerank-ai.com
```

**注意**: 
- `NEXTAUTH_URL`は**プロトコル（`https://`）を含む完全なURL**である必要があります
- `http://`は使用できません（本番環境ではHTTPS必須）
- 末尾にスラッシュ（`/`）は不要です

### 2. Google OAuth設定

```bash
# 必須: Google OAuth Client ID
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# 必須: Google OAuth Client Secret
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Google Cloud Consoleでの設定確認

Google Cloud Console（https://console.cloud.google.com/apis/credentials）で以下を確認：

1. **承認済みのリダイレクト URI**に以下が追加されているか：
   ```
   https://rerank-ai.com/api/auth/callback/google
   https://www.rerank-ai.com/api/auth/callback/google
   ```

2. **承認済みのJavaScript生成元**に以下が追加されているか（必要に応じて）：
   ```
   https://rerank-ai.com
   https://www.rerank-ai.com
   ```

## Vercelでの環境変数設定方法

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. **Settings** → **Environment Variables**を開く
4. 以下の環境変数を追加/確認：

| 環境変数名 | 値の例 | 説明 |
|-----------|--------|------|
| `AUTH_SECRET` | `abc123...` | ランダムな文字列（`openssl rand -base64 32`で生成） |
| `NEXTAUTH_URL` | `https://rerank-ai.com` | 本番環境のURL |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | `xxx` | Google OAuth Client Secret |

5. **Environment**で**Production**を選択
6. **Save**をクリック
7. デプロイを再実行（環境変数を変更した場合は再デプロイが必要）

## トラブルシューティング

### エラー: `error=Configuration`

**原因**: NextAuth.jsの設定が不完全

**確認項目**:
- [ ] `AUTH_SECRET`または`NEXTAUTH_SECRET`が設定されている
- [ ] `NEXTAUTH_URL`が正しく設定されている（`https://`で始まる）
- [ ] `GOOGLE_CLIENT_ID`が設定されている
- [ ] `GOOGLE_CLIENT_SECRET`が設定されている
- [ ] Google Cloud ConsoleでリダイレクトURIが正しく設定されている

### エラー: `redirect_uri_mismatch`

**原因**: Google Cloud ConsoleのリダイレクトURIと実際のURLが一致しない

**解決方法**:
1. Google Cloud ConsoleでリダイレクトURIを確認
2. `NEXTAUTH_URL`の値と一致するように設定
3. `www`付きと非`www`の両方を設定することを推奨

### 環境変数が反映されない

**解決方法**:
1. Vercelダッシュボードで環境変数を確認
2. **Production**環境に設定されているか確認
3. 環境変数を変更した場合は、**再デプロイ**が必要

## 環境変数の生成方法

### AUTH_SECRETの生成

```bash
openssl rand -base64 32
```

または

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 確認コマンド

Vercelのログで環境変数が正しく読み込まれているか確認：

```bash
# Vercel CLIを使用する場合
vercel logs --follow
```

ログに以下のようなエラーが表示される場合、環境変数が設定されていません：

```
[NextAuth][error][CONFIGURATION_ERROR] Missing required environment variable: AUTH_SECRET
```

