# GSC連携とログインのフロー

## 現在の実装状況

### 1. GSC連携時の処理

**`/api/sites/save`エンドポイント**:
- `session`が必要（`auth()`で取得）
- `session.userId`が必要
- **つまり、GSC連携時には既にログインしている必要がある**

### 2. ログイン時の処理

**Google OAuthログイン時**（`lib/auth.ts`）:
```typescript
// JWTコールバックでユーザーを作成/更新
if (account.provider === "google") {
  const dbUser = await getOrCreateUser(
    user.email,
    user.name || null,
    account.provider,
    account.providerAccountId
  );
  token.userId = dbUser.id;
}
```

**`getOrCreateUser()`の動作**:
1. 既存ユーザーを検索（メールアドレスで）
2. 既存ユーザーがいる場合: 更新（`provider`, `provider_id`を更新）
3. 既存ユーザーがいない場合: 新規作成

## 問題点

### シナリオ: ログインしていない状態でGSC連携

**現在の実装では不可能**:
- GSC連携には`session`が必要
- `session`はログイン後にのみ取得可能
- つまり、ログインしていない状態でGSC連携はできない

### 想定されるフロー

ユーザーが想定している可能性のあるフロー：
1. トップページで「Googleでログイン」をクリック
2. Google認証が行われる（この時点で`getOrCreateUser()`が呼ばれ、usersテーブルにデータが入る）
3. ログイン完了後、GSC連携を行う
4. その後、ログアウトして再度ログインしたい場合

## 実際の動作

### ケース1: 初回ログイン（Google OAuth）

1. 「Googleでログイン」をクリック
2. Google認証画面でアカウント選択
3. 認証成功後、`getOrCreateUser()`が呼ばれる
4. usersテーブルに新規ユーザーが作成される
   - `email`: Googleアカウントのメールアドレス
   - `provider`: "google"
   - `email_verified`: true
   - `password_hash`: NULL
5. セッションが作成され、`/dashboard`にリダイレクト

### ケース2: 既存ユーザーが再度ログイン（Google OAuth）

1. 「Googleでログイン」をクリック
2. Google認証画面でアカウント選択
3. 認証成功後、`getOrCreateUser()`が呼ばれる
4. 既存ユーザーが見つかる（メールアドレスで検索）
5. 既存ユーザーの情報が更新される
   - `provider`: "google"（更新）
   - `provider_id`: GoogleアカウントID（更新）
6. セッションが作成され、`/dashboard`にリダイレクト

### ケース3: GSC連携後にログアウトして再度ログイン

1. 既にGSC連携済みのユーザーがログアウト
2. 「Googleでログイン」をクリック
3. Google認証画面でアカウント選択
4. 認証成功後、`getOrCreateUser()`が呼ばれる
5. 既存ユーザーが見つかる（メールアドレスで検索）
6. 既存ユーザーの情報が更新される
7. セッションが作成され、`/dashboard`にリダイレクト
8. **GSC連携情報（sitesテーブル）は保持される**（`user_id`で紐づいているため）

## 結論

**現在の実装では問題なし**:
- GSC連携はログイン後にのみ可能
- ログイン時に`getOrCreateUser()`が呼ばれ、既存ユーザーは更新される
- 既存ユーザーが再度ログインしても、GSC連携情報は保持される

**ただし、以下の点に注意**:
- 同じメールアドレスでGoogleログインとメール/パスワード登録を両方行うことはできない（`createUserWithPassword()`で既存ユーザーチェックがあるため）
- 将来的に、Googleログインで登録したユーザーが後からパスワードを設定できるようにする機能を追加することを検討

