# メール通知テスト用コード

このディレクトリには、メール通知機能のテスト用コードが保存されています。

## ファイル構成

- `api-route.ts`: テスト用APIエンドポイント（`/api/notifications/test`）
- `test-page.tsx`: テスト用フロントエンドページ（`/test-notification`）
- `layout.tsx`: テストページ用のレイアウト

## 使用方法

### 1. ファイルを適切な場所にコピー

```bash
# APIエンドポイント
cp test/notifications/api-route.ts app/api/notifications/test/route.ts

# テストページ
cp test/notifications/test-page.tsx app/test-notification/page.tsx
cp test/notifications/layout.tsx app/test-notification/layout.tsx
```

### 2. 環境変数の設定

`.env.local`に以下を設定：

```env
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=noreply@rerank-ai.com
```

### 3. テスト実行

1. 開発サーバーを起動: `npm run dev`
2. ブラウザで `http://localhost:3000/test-notification` にアクセス
3. メールアドレスを入力して「テストメールを送信」をクリック

## 注意事項

- このコードは開発・テスト用です
- 本番環境では使用しないでください
- 開発環境では認証不要ですが、本番環境では認証が必要です

## モックデータ

テスト用のモックデータには以下が含まれます：
- 順位下落情報（5.2位 → 12.8位、7.6位下落）
- 転落キーワード（2つ）
- 推奨追加項目（2つ）

