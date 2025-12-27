# Googleログイン時のパスワードの扱い

## 現在の実装

### Google OAuth認証の場合

1. **パスワードは不要**
   - Google OAuthで認証されるため、パスワードは設定されません
   - `password_hash`カラムは`NULL`のまま

2. **メール認証も不要**
   - Googleが既にメールアドレスを認証済みのため、`email_verified`は`true`に設定されます（実装要確認）

3. **ユーザー作成時の処理**
   ```typescript
   // lib/db/users.ts - getOrCreateUser()
   // Google OAuthの場合、password_hashは設定しない
   const { data: newUser } = await supabase
     .from('users')
     .insert({
       email,
       name,
       provider: 'google',  // providerが'google'
       provider_id: providerId,
       // password_hashは設定しない（NULLのまま）
       // email_verifiedはtrueに設定すべき（実装要確認）
     })
   ```

### メール/パスワード認証の場合

1. **パスワードは必須**
   - `password_hash`にbcryptでハッシュ化したパスワードを保存
   - `email_verified`は`false`（メール認証が必要）

2. **ユーザー作成時の処理**
   ```typescript
   // lib/db/users.ts - createUserWithPassword()
   const passwordHash = await hashPassword(password);
   const { data: newUser } = await supabase
     .from('users')
     .insert({
       email,
       password_hash: passwordHash,  // パスワードハッシュを保存
       email_verified: false,  // メール認証が必要
       provider: 'credentials',
     })
   ```

## 考慮事項

### 1. 同じメールアドレスで両方の認証方法を使う場合

**現在の実装**: 
- 同じメールアドレスでGoogleログインとメール/パスワード登録を両方行うことはできません
- `getUserByEmail()`で既存ユーザーをチェックしているため

**推奨される動作**:
- Googleログインで登録したユーザーが、後からパスワードを設定できるようにする
- または、メール/パスワードで登録したユーザーが、後からGoogleアカウントを連携できるようにする

### 2. メール認証の扱い

**Google OAuthの場合**:
- Googleが既にメールアドレスを認証済み
- `email_verified`を`true`に設定すべき（現在の実装では設定していない可能性）

**修正が必要な箇所**:
```typescript
// lib/db/users.ts - getOrCreateUser()
// Google OAuthの場合、email_verifiedをtrueに設定
const { data: newUser } = await supabase
  .from('users')
  .insert({
    email,
    name,
    provider: 'google',
    provider_id: providerId,
    email_verified: true,  // Google OAuthの場合はtrue
    // password_hashはNULLのまま
  })
```

## まとめ

- **Googleログイン**: パスワード不要、`password_hash`は`NULL`
- **メール/パスワード**: パスワード必須、`password_hash`にハッシュを保存
- **両方の認証方法をサポート**: 将来的な拡張として検討可能

