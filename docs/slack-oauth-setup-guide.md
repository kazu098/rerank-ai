# Slack OAuth設定ガイド

このガイドでは、ReRank AIでSlack通知機能を使用するためのSlack OAuth設定手順を説明します。

## 前提条件

- Slackワークスペースへの管理者権限（またはアプリ作成権限）
- 通知を受け取りたいSlackチャンネルまたはDMへのアクセス権

## 重要な注意事項

⚠️ **現在の実装では、OAuth認証時に選択したワークスペースにのみ通知が送信されます。**

- 各ユーザーは**自分のワークスペース**にSlack Appをインストールして使用します
- 1人のユーザーが複数のワークスペースに通知したい場合、現時点では対応していません
- 別のワークスペースに通知したい場合は、連携を解除して再認証する必要があります

詳細は `docs/slack-oauth-multi-workspace-considerations.md` を参照してください。

## 手順

### 1. Slack Appの作成

1. **Slack APIサイトにアクセス**
   - https://api.slack.com/apps にアクセス
   - ログインしているSlackアカウントでサインイン

2. **新しいアプリを作成**
   - 「Create New App」ボタンをクリック
   - 「From scratch」を選択
   - 以下の情報を入力：
     - **App Name**: `ReRank AI`（任意の名前）
     - **Pick a workspace**: **任意のワークスペースを選択**（開発者が所属するワークスペースでOK）
       - ⚠️ **重要**: この選択は開発用の「ホームワークスペース」です
       - **各ユーザーはOAuth認証時に自分のワークスペースを選択できます**
       - 開発者が選択したワークスペースに通知が送られるわけではありません
   - 「Create App」をクリック

3. **配布設定（Distribution）を確認・変更** ⚠️ **重要**
   - 左メニューから「**Manage Distribution**」をクリック
   - 「**Public Distribution**」セクションを確認
   - **「Distribute App」ボタンをクリックして、アプリを公開配布に設定**
     - これにより、すべてのワークスペースにアプリをインストールできるようになります
     - 公開配布にしないと、開発者が選択したワークスペース（ホームワークスペース）にのみインストール可能になります
   - 「**Add to Slack**」ページのURLが生成されます（これは開発者向けの情報です）
   
   ⚠️ **重要**: 
   - 「アプリは Slack の承認を受けていません」というメッセージが表示される場合がありますが、これは**Slack Marketplaceへの掲載に関するメッセージ**です
   - **Public Distributionを有効にするだけなら、このメッセージは無視して問題ありません**
   - Slack Marketplaceに掲載する必要はありません。単に「Distribute App」ボタンをクリックするだけで、すべてのワークスペースにアプリをインストールできるようになります
   - 公開配布に設定しないと、OAuth認証画面でホームワークスペースしか表示されません
   - 公開配布に設定することで、ユーザーが所属するすべてのワークスペースがOAuth認証画面に表示されます

### 2. OAuth設定

1. **OAuth & Permissionsページに移動**
   - 左メニューから「OAuth & Permissions」をクリック

2. **Redirect URLsを設定**
   - 「Redirect URLs」セクションまでスクロール
   - 「Add New Redirect URL」をクリック
   - 以下のURLを追加（**HTTPSのみ対応**）：
     - **本番環境**: `https://your-domain.com/api/auth/slack/callback`
     - **www付きドメインも追加**（使用している場合）: `https://www.your-domain.com/api/auth/slack/callback`
       （実際のドメインに置き換えてください）
   - ⚠️ **重要**: `www`付きと`www`なしの両方を使用する場合は、両方のURLを追加してください
   - 「Save URLs」をクリック
   
   ⚠️ **重要**: 
   - SlackはHTTPSのみを許可します（`http://localhost:3000`は使用できません）
   - 開発環境でも動作させるには、**`NEXTAUTH_URL`を本番環境のURLに設定**する必要があります
   - 開発環境で`http://localhost:3000`を使う場合は、ngrokなどのツールでHTTPS URLを取得してSlack Appに追加してください

3. **Bot Token Scopesを設定**
   - 「Scopes」セクションの「Bot Token Scopes」までスクロール
   - 「Add an OAuth Scope」をクリックして、以下のスコープを追加：
     - `chat:write` - メッセージを送信（チャネル・DM両方に使用、必須）
     - `chat:write.public` - パブリックチャンネルにメッセージを送信（Botが参加していないチャンネルにも送信可能、推奨）
     - `users:read` - ユーザー情報を取得（User ID取得用、必須）
     - `im:write` - DMを送信（オプション、`chat:write`でカバー可能）
     - `channels:read` - パブリックチャネル一覧を取得（チャネル選択機能用）
     - `groups:read` - プライベートチャネル一覧を取得（チャネル選択機能用）
     
   **注意**: チャネルにメッセージを送信する際は`chat:write`スコープを使用します。`channels:write`というスコープは存在しません（チャネル作成など別用途のスコープです）。

4. **User Token Scopes（オプション）**
   - 通常はBot Token Scopesのみで十分です
   - 必要に応じて「User Token Scopes」にも同様のスコープを追加

### 3. App Credentialsの取得

1. **Basic Informationページに移動**
   - 左メニューから「Basic Information」をクリック

2. **App Credentialsを確認**
   - 「App Credentials」セクションで以下を確認：
     - **Client ID**: 後で使用します
     - **Client Secret**: 「Show」をクリックして表示（後で使用します）

### 4. アプリをワークスペースにインストール

1. **Install Appページに移動**
   - 左メニューから「Install App」をクリック
   - または「OAuth & Permissions」ページの上部にある「Install to Workspace」ボタンをクリック

2. **権限を確認してインストール**
   - 表示される権限を確認
   - 「Allow」をクリックしてワークスペースにインストール

3. **Bot User OAuth Tokenを確認**
   - インストール後、「OAuth & Permissions」ページに戻る
   - 「Bot User OAuth Token」が表示されます（`xoxb-`で始まる）
   - このトークンは自動的に管理されるため、手動でコピーする必要はありません

### 5. 環境変数の設定

1. **ローカル環境（`.env.local`）**
   ```bash
   SLACK_CLIENT_ID=your-client-id-here
   SLACK_CLIENT_SECRET=your-client-secret-here
   # Googleログインなどは開発環境のURLを使用
   NEXTAUTH_URL=http://localhost:3000
   # Slack OAuthのみ本番環境のURLを使用（SlackはHTTPSのみ許可）
   SLACK_REDIRECT_BASE_URL=https://your-domain.com
   ```

2. **本番環境（Vercel）**
   - Vercelダッシュボードにアクセス
   - プロジェクトの「Settings」→「Environment Variables」に移動
   - 以下の環境変数を追加：
     - `SLACK_CLIENT_ID`: 取得したClient ID
     - `SLACK_CLIENT_SECRET`: 取得したClient Secret
     - `NEXTAUTH_URL`: 本番環境のURL（例: `https://your-domain.com`）

### 6. 動作確認

1. **ローカル環境でテスト**
   ```bash
   # 開発サーバーを起動
   npm run dev
   ```

2. **設定画面で連携**
   - `http://localhost:3000/ja/dashboard/settings` にアクセス
   - 「Slack通知設定」セクションで「Slackと連携」ボタンをクリック
   - Slack認証画面が表示されることを確認
   - 認証後、設定画面に戻り「Slackと連携済み」と表示されることを確認
   - ⚠️ **注意**: OAuth認証後のリダイレクトは本番環境のURL（`https://your-domain.com`）に戻りますが、これは正常な動作です

3. **通知のテスト**
   - テスト用のエンドポイントを使用（開発環境のみ）:
     ```bash
     curl "http://localhost:3000/api/test/slack-notification?webhookUrl=YOUR_WEBHOOK_URL&locale=ja"
     ```
   - または、実際の順位下落を待って自動通知を確認

## トラブルシューティング

### エラー: `invalid_client`

**原因**: Client IDまたはClient Secretが正しく設定されていない

**解決方法**:
1. 環境変数が正しく設定されているか確認
2. `.env.local`ファイルが正しく読み込まれているか確認
3. Vercelの環境変数が正しく設定されているか確認

### エラー: `redirect_uri_mismatch`

**原因**: Redirect URLがSlack Appの設定と一致していない

**解決方法**:
1. Slack Appの「OAuth & Permissions」ページでRedirect URLを確認
2. 以下のURLが追加されているか確認（**HTTPSのみ**）：
   - 本番環境: `https://your-domain.com/api/auth/slack/callback`
3. `NEXTAUTH_URL`環境変数が正しく設定されているか確認（本番環境のURLを使用）
4. 開発環境でも本番環境のURLを使用していることを確認

### エラー: `missing_scope`

**原因**: 必要なスコープが設定されていない

**解決方法**:
1. Slack Appの「OAuth & Permissions」ページで「Bot Token Scopes」を確認
2. 以下のスコープが追加されているか確認：
   - `chat:write` - メッセージ送信（チャネル・DM両方に使用、必須）
   - `chat:write.public` - パブリックチャンネルにメッセージを送信（Botが参加していないチャンネルにも送信可能、推奨）
   - `users:read` - ユーザー情報取得（必須）
   - `im:write` - DM送信（オプション、`chat:write`でカバー可能）
   - `channels:read` - パブリックチャネル一覧を取得（チャネル選択機能用）
   - `groups:read` - プライベートチャネル一覧を取得（チャネル選択機能用）

### 通知が送信されない

**原因**: Bot Tokenが無効、またはチャンネル/ユーザーIDが正しく設定されていない

**解決方法**:
1. 設定画面で「Slackと連携済み」と表示されているか確認
2. 通知設定が正しく保存されているか確認（DBを確認）
3. Cronジョブのログを確認してエラーメッセージを確認

### DM送信が失敗する

**原因**: Botがユーザーと会話を開始していない

**解決方法**:
1. 初回DM送信時、Botが自動的に会話を開始します
2. それでも失敗する場合、手動でBotにDMを送信して会話を開始してください

## セキュリティに関する注意事項

1. **Client Secretの管理**
   - Client Secretは機密情報です。Gitリポジトリにコミットしないでください
   - `.env.local`は`.gitignore`に含まれていることを確認

2. **Bot Tokenの管理**
   - Bot Tokenは自動的にDBに保存されます
   - 必要に応じて、定期的にトークンを更新することを推奨

3. **スコープの最小化**
   - 必要最小限のスコープのみを設定してください
   - 不要なスコープは削除してください

## 参考リンク

- [Slack API Documentation](https://api.slack.com/)
- [Slack OAuth 2.0 Guide](https://api.slack.com/authentication/oauth-v2)
- [Slack App Manifest](https://api.slack.com/reference/manifests)

