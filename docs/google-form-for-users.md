# ユーザー向けGoogle Formお問い合わせフォーム設計

実際にReRank AIを使用しているユーザーからの問い合わせ・フィードバック用のGoogle Formの設計です。

## フォームの目的

- 使用中ユーザーからのサポート依頼
- 機能改善リクエスト
- 新機能リクエスト
- バグ報告
- その他のフィードバック

## フォーム項目（推奨構成）

### 1. メールアドレス（必須）
- **項目名**: メールアドレス / Email Address
- **種類**: 短答形式（テキスト）
- **説明文**: 
  - 日本語: 「お問い合わせ内容について返信いたします。登録されているメールアドレスをご入力ください。」
  - 英語: "We will respond to your inquiry. Please enter your registered email address."
- **検証**: メールアドレス形式

### 2. お問い合わせ種別（必須）
- **項目名**: お問い合わせ種別 / Inquiry Type
- **種類**: ラジオボタン（単一選択）
- **説明文**: 
  - 日本語: 「お問い合わせの種類を選択してください。」
  - 英語: "Please select the type of inquiry."
- **選択肢**:
  1. 技術的な問題・バグ報告 / Technical Issue / Bug Report
  2. 機能改善リクエスト / Feature Improvement Request
  3. 新機能リクエスト / New Feature Request
  4. 使い方について / How to Use
  5. アカウント関連 / Account Related
  6. 料金・請求について / Billing / Payment
  7. その他 / Other

### 3. 件名（必須）
- **項目名**: 件名 / Subject
- **種類**: 短答形式（テキスト）
- **説明文**: 
  - 日本語: 「お問い合わせの件名を簡潔に入力してください（50文字以内推奨）。」
  - 英語: "Please enter a brief subject for your inquiry (recommended: 50 characters or less)."
- **検証**: 最大100文字

### 4. お問い合わせ内容（必須）
- **項目名**: お問い合わせ内容 / Inquiry Details
- **種類**: 長答形式（段落形式）
- **説明文**: 
  - 日本語: 「お問い合わせ内容を詳しくご記入ください。問題が発生している場合は、発生した操作手順やエラーメッセージも含めてください。機能リクエストの場合は、どのような機能が必要か、なぜ必要かを詳しくお書きください。」
  - 英語: "Please describe your inquiry in detail. If you are reporting an issue, please include the steps you took and any error messages. For feature requests, please explain what functionality you need and why."
- **検証**: 最大2000文字

### 5. 発生している問題の詳細（条件付き）
- **項目名**: 発生している問題の詳細 / Problem Details
- **種類**: 長答形式（段落形式）
- **説明文**: 
  - 日本語: 「技術的な問題・バグ報告を選択した場合のみ、以下についてご記入ください：\n- 問題が発生した日時\n- 操作していたページや機能\n- 再現手順（ステップバイステップ）\n- 期待していた動作\n- 実際の動作\n- エラーメッセージ（あれば）\n- スクリーンショットのURL（Google Driveなどの共有リンク）」
  - 英語: "If you selected 'Technical Issue / Bug Report', please provide the following information:\n- When the issue occurred (date and time)\n- Page or feature you were using\n- Steps to reproduce the issue\n- Expected behavior\n- Actual behavior\n- Error messages (if any)\n- Screenshot URLs (shared link from Google Drive, etc.)"
- **検証**: 最大2000文字
- **条件ロジック**: 「お問い合わせ種別」が「技術的な問題・バグ報告」の場合のみ表示

### 6. 改善・新機能リクエストの詳細（条件付き）
- **項目名**: 改善・新機能リクエストの詳細 / Feature Request Details
- **種類**: 長答形式（段落形式）
- **説明文**: 
  - 日本語: 「機能改善リクエストまたは新機能リクエストを選択した場合、以下についてご記入ください：\n- どのような機能が欲しいか\n- なぜその機能が必要か（使用シーンや課題）\n- 現在どのように対応しているか\n- 期待される効果（任意）」
  - 英語: "If you selected 'Feature Improvement Request' or 'New Feature Request', please provide the following information:\n- What functionality you want\n- Why you need this feature (use cases or problems)\n- How you are currently dealing with this (if applicable)\n- Expected benefits (optional)"
- **検証**: 最大2000文字
- **条件ロジック**: 「お問い合わせ種別」が「機能改善リクエスト」または「新機能リクエスト」の場合のみ表示

### 7. 優先度（任意）
- **項目名**: 優先度 / Priority
- **種類**: ドロップダウン（単一選択）
- **説明文**: 
  - 日本語: 「このお問い合わせの優先度を選択してください（任意）。緊急度が高い場合は、件名に【緊急】と記載してください。」
  - 英語: "Please select the priority of this inquiry (optional). If urgent, please include [URGENT] in the subject."
- **選択肢**:
  1. 通常 / Normal
  2. 高 / High
  3. 緊急 / Urgent

### 8. 補足情報（任意）
- **項目名**: 補足情報 / Additional Information
- **種類**: 長答形式（段落形式）
- **説明文**: 
  - 日本語: 「その他、補足情報があればご記入ください。」
  - 英語: "Please provide any additional information if applicable."
- **検証**: 最大500文字

## Google Formの設定

### 基本設定
- **フォームタイトル**: 「ReRank AI お問い合わせフォーム」/ "ReRank AI Contact Form"
- **フォームの説明**: 
  - 日本語: 「ReRank AIに関するお問い合わせ、改善提案、新機能リクエストなど、お気軽にご連絡ください。通常、2-3営業日以内に返信いたします。」
  - 英語: "Please feel free to contact us about ReRank AI, improvement suggestions, new feature requests, etc. We typically respond within 2-3 business days."

### 設定オプション
- **回答を1回に制限**: チェック（スパム防止）
- **回答の編集を許可**: チェック（ユーザーが誤入力した場合に修正可能）
- **回答後に確認メールを送信**: チェック
- **送信後メッセージ**: 
  - 日本語: 「お問い合わせありがとうございます。内容を確認の上、2-3営業日以内にご返信いたします。\n\n緊急のお問い合わせの場合は、件名に【緊急】と記載していただくか、support@rerank-ai.com まで直接ご連絡ください。」
  - 英語: "Thank you for your inquiry. We will review your message and respond within 2-3 business days.\n\nFor urgent inquiries, please include [URGENT] in the subject or contact support@rerank-ai.com directly."

### 回答の通知設定
- **メール通知**: 新しい回答が送信されるたびにメール通知を受け取る
- **通知先**: support@rerank-ai.com（または担当者のメールアドレス）

### スプレッドシートへの連携（オプション）
- **Google Sheets**: 回答を自動的にスプレッドシートに記録
- **列の構成**:
  1. タイムスタンプ
  2. メールアドレス
  3. お問い合わせ種別
  4. 件名
  5. お問い合わせ内容
  6. 発生している問題の詳細（該当する場合）
  7. 改善・新機能リクエストの詳細（該当する場合）
  8. 優先度
  9. 補足情報

## 実装時の注意事項

1. **フォームURLの取得**
   - Google Form作成後、「送信」ボタンから「リンク」を選択
   - URLをコピーして、ダッシュボードの設定画面に埋め込みまたはリンクとして表示

2. **ダッシュボードへの配置**
   - 設定ページ（Settings）またはヘルプセクションに「お問い合わせ」ボタンまたはリンクを追加
   - Google Formを新しいタブで開くように設定

3. **ユーザー情報の自動入力（オプション）**
   - Google Formにメールアドレスを自動入力する場合は、URLパラメータを使用
   - 例: `https://docs.google.com/forms/d/e/FORM_ID/viewform?entry.ENTRY_ID=USER_EMAIL`
   - ただし、セキュリティ上の理由から、完全自動入力は非推奨

## 使用例（ダッシュボードでの表示）

```
お問い合わせ / Contact

サービスに関するお問い合わせ、改善提案、新機能リクエストなどがございましたら、
お気軽にご連絡ください。通常、2-3営業日以内に返信いたします。

[Google Formを開く] ボタン
```

## テンプレートフォームURL（作成後の設定）

フォームを作成後、以下のようにダッシュボードに埋め込みます：

```typescript
// ダッシュボードの設定ページなど
<a 
  href="https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform" 
  target="_blank" 
  rel="noopener noreferrer"
  className="..."
>
  Google Formを開く
</a>
```

または、iframeで埋め込むことも可能ですが、Google Formの設定で許可する必要があります。

## フォーム項目のサンプル（日本語版）

### 1. メールアドレス
**説明**: お問い合わせ内容について返信いたします。登録されているメールアドレスをご入力ください。

### 2. お問い合わせ種別
**説明**: お問い合わせの種類を選択してください。
- 技術的な問題・バグ報告
- 機能改善リクエスト
- 新機能リクエスト
- 使い方について
- アカウント関連
- 料金・請求について
- その他

### 3. 件名
**説明**: お問い合わせの件名を簡潔に入力してください（50文字以内推奨）。

### 4. お問い合わせ内容
**説明**: お問い合わせ内容を詳しくご記入ください。問題が発生している場合は、発生した操作手順やエラーメッセージも含めてください。機能リクエストの場合は、どのような機能が必要か、なぜ必要かを詳しくお書きください。

### 5. 発生している問題の詳細（条件付き）
**説明**: 技術的な問題・バグ報告を選択した場合のみ、以下についてご記入ください：
- 問題が発生した日時
- 操作していたページや機能
- 再現手順（ステップバイステップ）
- 期待していた動作
- 実際の動作
- エラーメッセージ（あれば）
- スクリーンショットのURL（Google Driveなどの共有リンク）

### 6. 改善・新機能リクエストの詳細（条件付き）
**説明**: 機能改善リクエストまたは新機能リクエストを選択した場合、以下についてご記入ください：
- どのような機能が欲しいか
- なぜその機能が必要か（使用シーンや課題）
- 現在どのように対応しているか
- 期待される効果（任意）

### 7. 優先度（任意）
**説明**: このお問い合わせの優先度を選択してください（任意）。緊急度が高い場合は、件名に【緊急】と記載してください。
- 通常
- 高
- 緊急

### 8. 補足情報（任意）
**説明**: その他、補足情報があればご記入ください。

