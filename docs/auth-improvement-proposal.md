# 認証機能の改善提案

## 現状

- **NextAuth.js**でGoogle OAuth認証のみ実装
- GSC連携時にGoogle OAuthでログイン
- メール/パスワード認証は未実装
- 認証メール機能は未実装

## 改善提案

### 1. Gmailの自動入力機能

**実装方法**:
- GSC連携時に取得したメールアドレスを`localStorage`に保存
- ログイン画面で`localStorage`からメールアドレスを取得して自動入力

**メリット**:
- ユーザーの入力負担を軽減
- 既存のGSC連携フローを活用

**実装箇所**:
- `app/[locale]/page.tsx`: GSC連携時にメールアドレスを`localStorage`に保存
- `app/[locale]/auth/signin/page.tsx`: ログイン画面で自動入力

---

### 2. 認証方式の選択: NextAuth.js vs Firebase Authentication

#### オプションA: NextAuth.jsで拡張（推奨）

**メリット**:
- ✅ 既存実装を活用できる
- ✅ Supabaseと統合しやすい（既にSupabaseを使用中）
- ✅ カスタマイズ性が高い
- ✅ 追加の外部サービス不要
- ✅ コストが低い（Firebase Authの無料枠制限なし）

**実装内容**:
1. **Credentials Provider**を追加（メール/パスワード認証）
   ```typescript
   Credentials({
     credentials: {
       email: { label: "Email", type: "email" },
       password: { label: "Password", type: "password" }
     },
     async authorize(credentials) {
       // Supabaseでメール/パスワード認証
       // bcryptでパスワードハッシュ化
     }
   })
   ```

2. **メール認証機能**
   - Resendを使用して認証メールを送信
   - 認証トークンをDBに保存
   - トークン検証エンドポイントを作成

3. **パスワードリセット機能**
   - パスワードリセットメール送信
   - リセットトークン検証
   - 新パスワード設定

**必要なDB変更**:
```sql
-- usersテーブルに追加
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN email_verification_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN password_reset_token_expires_at TIMESTAMP WITH TIME ZONE;
```

**コスト**:
- 追加コストなし（Resendは既に使用中）

---

#### オプションB: Firebase Authentication

**メリット**:
- ✅ メール/パスワード認証が簡単
- ✅ 認証メール機能が標準装備
- ✅ パスワードリセット機能が標準装備
- ✅ ソーシャルログイン（Google、GitHub等）が簡単

**デメリット**:
- ❌ 既存のNextAuth.js実装を大幅に変更する必要がある
- ❌ 追加の外部サービス（Firebase）が必要
- ❌ 無料枠の制限（月間5万リクエスト）
- ❌ Supabaseとの統合が複雑になる可能性
- ❌ コストが発生する可能性（スケール時）

**実装内容**:
1. Firebase Authentication SDKの導入
2. 既存のNextAuth.js実装をFirebase Authに置き換え
3. SupabaseとFirebase Authの連携

**コスト**:
- 無料枠: 月間5万リクエストまで
- 超過時: $0.0055/リクエスト

---

### 3. 推奨実装方針

**推奨: NextAuth.jsで拡張（オプションA）**

**理由**:
1. **既存実装の活用**: 既にNextAuth.jsでGoogle OAuthが実装済み
2. **Supabase統合**: 既にSupabaseを使用しているため、追加の外部サービス不要
3. **コスト効率**: Firebase Authの無料枠制限を気にせず使える
4. **カスタマイズ性**: 認証フローを完全にコントロール可能
5. **Resend活用**: 既にResendを使用しているため、認証メールも同じサービスで統一

**実装順序**:
1. Gmail自動入力機能（簡単、即効性あり）
2. メール/パスワード認証（NextAuth.js Credentials Provider）
3. メール認証機能（Resend + DBトークン管理）
4. パスワードリセット機能（Resend + DBトークン管理）

---

### 4. 実装詳細

#### 4.1 Gmail自動入力機能

**フロー**:
1. GSC連携時に`localStorage.setItem('lastEmail', email)`を保存
2. ログイン画面で`localStorage.getItem('lastEmail')`を取得して自動入力

**実装箇所**:
```typescript
// app/[locale]/page.tsx (GSC連携時)
if (session?.user?.email) {
  localStorage.setItem('lastEmail', session.user.email);
}

// app/[locale]/auth/signin/page.tsx
const [email, setEmail] = useState(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('lastEmail') || '';
  }
  return '';
});
```

#### 4.2 メール/パスワード認証

**必要なパッケージ**:
```bash
npm install bcryptjs
npm install @types/bcryptjs
```

**実装**:
- `lib/auth.ts`にCredentials Providerを追加
- `lib/db/users.ts`にパスワードハッシュ化関数を追加
- `app/api/auth/register/route.ts`でユーザー登録APIを作成
- `app/api/auth/verify-email/route.ts`でメール認証APIを作成

#### 4.3 認証メール

**実装**:
- `lib/email-verification.ts`で認証メール送信機能を作成
- Resendを使用して認証メールを送信
- 認証トークンをDBに保存（有効期限: 24時間）
- 認証リンク: `https://rerank-ai.com/auth/verify-email?token=xxx`

#### 4.4 パスワードリセット

**実装**:
- `app/api/auth/forgot-password/route.ts`でパスワードリセットメール送信
- `app/api/auth/reset-password/route.ts`でパスワードリセット処理
- リセットトークンをDBに保存（有効期限: 1時間）

---

### 5. セキュリティ考慮事項

1. **パスワードハッシュ化**: bcrypt（推奨ラウンド数: 12）
2. **認証トークン**: ランダムな32文字の文字列（UUID推奨）
3. **トークン有効期限**: 
   - メール認証: 24時間
   - パスワードリセット: 1時間
4. **レート制限**: 認証メール送信は1時間に3回まで
5. **HTTPS必須**: 本番環境ではHTTPS必須

---

### 6. UX改善

1. **ログイン画面の改善**:
   - Gmail自動入力
   - 「Googleでログイン」と「メール/パスワードでログイン」のタブ切り替え
   - 「パスワードを忘れた場合」リンク

2. **登録フロー**:
   - メール/パスワード入力
   - 認証メール送信
   - 認証メール確認後、アカウント有効化

3. **パスワード要件**:
   - 最低8文字
   - 大文字・小文字・数字を含む（推奨）

---

## 結論

**推奨**: NextAuth.jsで拡張（オプションA）

**理由**:
- 既存実装の活用
- Supabase統合の容易さ
- コスト効率
- カスタマイズ性

**実装優先順位**:
1. Gmail自動入力機能（即効性あり）
2. メール/パスワード認証（基本機能）
3. メール認証機能（セキュリティ向上）
4. パスワードリセット機能（UX向上）

