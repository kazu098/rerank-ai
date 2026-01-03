# ローカル環境でのお問い合わせフォーム検証ガイド

## 必要な環境変数

ローカルでお問い合わせフォームをテストするには、以下の環境変数を `.env.local` に設定する必要があります。

### 必須環境変数

1. **RESEND_API_KEY**
   - Resend APIキー
   - [Resend](https://resend.com/)でアカウントを作成し、APIキーを取得
   - 無料枠: 月間3,000通まで

2. **RESEND_FROM_EMAIL**
   - 送信元メールアドレス
   - 例: `noreply@rerank-ai.com`
   - Resendでドメインを認証済みである必要があります

3. **SUPPORT_EMAIL** (オプション)
   - お問い合わせの送信先メールアドレス
   - デフォルト: `support@rerank-ai.com`
   - 設定しない場合はデフォルト値が使用されます

### ファイルアップロード機能をテストする場合

4. **BLOB_READ_WRITE_TOKEN**
   - Vercel Blob Storageのトークン
   - [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)でBlob Storageを作成
   - Vercelダッシュボードからトークンを取得

## セットアップ手順

### 1. .env.local ファイルの作成/更新

プロジェクトルートに `.env.local` ファイルを作成または更新します：

```bash
# プロジェクトルートで実行
cat >> .env.local << 'EOF'

# お問い合わせフォーム用
RESEND_API_KEY=your-resend-api-key-here
RESEND_FROM_EMAIL=noreply@your-domain.com
SUPPORT_EMAIL=support@rerank-ai.com

# ファイルアップロード用（オプション）
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_your-token-here
EOF
```

### 2. Resend APIキーの取得

1. [Resend](https://resend.com/)にアクセス
2. アカウントを作成（無料）
3. 「API Keys」からAPIキーを生成
4. ドメインを認証（送信元メールアドレスで使用するドメイン）
5. `.env.local`に `RESEND_API_KEY` と `RESEND_FROM_EMAIL` を設定

### 3. Vercel Blob Storageの設定（ファイルアップロードをテストする場合）

1. [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
2. プロジェクトを選択（または新規作成）
3. 「Storage」タブをクリック
4. 「Create Database」→「Blob」を選択
5. Blob Storageを作成
6. 「.env.local」タブから `BLOB_READ_WRITE_TOKEN` をコピー
7. `.env.local`に追加

### 4. 開発サーバーの起動

```bash
npm run dev
```

### 5. お問い合わせフォームにアクセス

ブラウザで以下のURLにアクセス：

- 日本語: http://localhost:3000/ja/contact
- 英語: http://localhost:3000/en/contact

## テスト手順

### 基本的なテスト

1. **フォーム入力**
   - お名前、メールアドレス、件名、メッセージを入力
   - 「送信する」をクリック

2. **確認事項**
   - 成功メッセージが表示される
   - 送信先メールアドレス（`SUPPORT_EMAIL`またはデフォルトの`support@rerank-ai.com`）にメールが届く
   - 送信者（入力したメールアドレス）に自動返信メールが届く

### ファイルアップロードのテスト

1. **ファイルを選択**
   - 「添付ファイル」フィールドからファイルを選択
   - 複数ファイル（最大5ファイル）を選択可能
   - 画像、PDF、テキストファイルが選択可能

2. **確認事項**
   - 選択したファイルが一覧表示される
   - ファイル名とサイズが表示される
   - 個別に削除できる
   - 送信後、メールにファイルのリンクが含まれる

### エラーテスト

1. **必須項目の未入力**
   - 必須項目を空にして送信
   - エラーメッセージが表示されることを確認

2. **ファイルサイズ超過**
   - 10MBを超えるファイルを選択
   - エラーメッセージが表示されることを確認

3. **ファイル数超過**
   - 6ファイル以上を選択
   - エラーメッセージが表示されることを確認

## トラブルシューティング

### メールが送信されない

**原因**: `RESEND_API_KEY` が設定されていない、または無効

**解決方法**:
1. `.env.local`に `RESEND_API_KEY` が正しく設定されているか確認
2. ResendダッシュボードでAPIキーが有効か確認
3. 開発サーバーを再起動

### ファイルがアップロードされない

**原因**: `BLOB_READ_WRITE_TOKEN` が設定されていない、または無効

**解決方法**:
1. `.env.local`に `BLOB_READ_WRITE_TOKEN` が設定されているか確認
2. VercelダッシュボードでBlob Storageが作成されているか確認
3. トークンが正しいか確認

### エラー: "メール送信設定に問題があります"

**原因**: `RESEND_API_KEY` が設定されていない

**解決方法**:
1. `.env.local`ファイルを確認
2. 環境変数が正しく設定されているか確認
3. 開発サーバーを再起動

### エラー: "Failed to upload files"

**原因**: `BLOB_READ_WRITE_TOKEN` が設定されていない、またはVercel Blob Storageへのアクセス権限がない

**解決方法**:
1. `.env.local`に `BLOB_READ_WRITE_TOKEN` が設定されているか確認
2. VercelダッシュボードでBlob Storageの状態を確認
3. トークンの権限を確認

## 開発時の注意事項

- `.env.local`ファイルはGitにコミットされません（`.gitignore`に含まれています）
- 環境変数を変更した場合は、開発サーバーを再起動してください
- Resendの無料枠は月間3,000通までです
- Vercel Blob Storageの無料枠は5GBまでです

## 本番環境での設定

本番環境（Vercel）では、Vercelダッシュボードの「Settings」→「Environment Variables」で以下を設定してください：

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SUPPORT_EMAIL` (オプション)
- `BLOB_READ_WRITE_TOKEN` (ファイルアップロードを使用する場合)

