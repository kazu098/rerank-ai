# 通知システムの仕組み

## 概要

通知システムは**2段階のプロセス**で動作しています：

1. **ランキングチェックCron** (`/api/cron/check-rank`)
   - 順位下落/上昇を検知
   - 新しい通知レコードを作成（`sent_at`はNULL）
   
2. **通知送信Cron** (`/api/cron/send-notifications`)
   - `sent_at IS NULL`の通知レコードを取得
   - メール/Slackに送信
   - `sent_at`を更新

## 詳細なフロー

### ステップ1: ランキングチェック (`/api/cron/check-rank`)

**実行頻度**: 1日1回（UTC 0時）

**処理内容**:
1. 監視対象の記事を取得
2. 各記事に対して`NotificationChecker.checkNotificationNeeded()`を実行
3. 通知が必要な場合、`notifications`テーブルに新規レコードを作成
   - `sent_at` = NULL（送信前の状態）
   - `notification_data` = 通知内容の詳細データ（JSONB）

**Cooldownチェック**:
```typescript
// lib/notification-checker.ts
const cooldownDays = effectiveSettings.notification_cooldown_days ?? 7;
if (article.last_notification_sent_at) {
  const daysSinceLastNotification = Math.floor(
    (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceLastNotification < cooldownDays) {
    // cooldown期間内のため、新しい通知レコードを作成しない
    return { shouldNotify: false, ... };
  }
}
```

**Cooldownが0の場合**:
- `daysSinceLastNotification < 0` は常にfalse
- cooldownチェックをパス
- 他の条件（順位下落など）を満たせば、新しい通知レコードが作成される

### ステップ2: 通知送信 (`/api/cron/send-notifications`)

**実行頻度**: 1時間ごと

**処理内容**:
1. `sent_at IS NULL`の通知レコードを取得
2. ユーザーごとにまとめる
3. 通知時刻をチェック（ユーザーのタイムゾーンと通知時刻設定）
4. 通知時刻に達している場合、メール/Slackに送信
5. `sent_at`を更新（送信完了のマーク）

## 重要なポイント

### 1. `sent_at`の意味

- **`sent_at = NULL`**: 送信待ちの通知レコード
- **`sent_at = 時刻`**: 既に送信済みの通知レコード

### 2. Cooldownの役割

Cooldownは**新しい通知レコードを作成するかどうか**を制御します。

- **Cooldown期間内**: 新しい通知レコードは作成されない
- **Cooldown期間経過後**: 新しい通知レコードが作成される可能性がある（他の条件を満たせば）
- **Cooldown = 0**: 常に新しい通知レコードが作成される可能性がある（他の条件を満たせば）

### 3. 既存の通知レコードと新しい通知レコード

**`sent_at`に時刻が入っている通知レコード**:
- 既に送信済み
- 再度送信されることはない
- `/api/cron/send-notifications`は`sent_at IS NULL`のレコードのみを処理

**新しい通知レコードの作成**:
- `/api/cron/check-rank`が実行される必要がある
- Cooldownが0でも、ランキングチェックcronが実行されない限り、新しい通知レコードは作成されない

## 現在の状態の確認方法

### 送信待ちの通知があるか確認

```sql
SELECT COUNT(*) FROM notifications WHERE sent_at IS NULL;
```

### 最後に通知が送信された日時を確認

```sql
SELECT article_id, last_notification_sent_at 
FROM articles 
WHERE last_notification_sent_at IS NOT NULL
ORDER BY last_notification_sent_at DESC;
```

### Cooldown設定を確認

```sql
SELECT user_id, notification_cooldown_days 
FROM user_alert_settings;
```

## 手動実行方法

### ランキングチェックを手動実行（新しい通知レコードを作成）

```bash
./scripts/check-rank-manual.sh
```

### 通知送信を手動実行（送信待ちの通知を送信）

```bash
./scripts/send-notifications-manual.sh
```

## まとめ

1. **Cooldown = 0の場合**: 新しい通知レコードが作成される可能性がある（ランキングチェックcron実行時、他の条件を満たせば）
2. **`sent_at`に時刻が入っている場合**: 既に送信済みの通知レコード。再度送信されることはない
3. **新しい通知を送信するには**: 
   - `/api/cron/check-rank`を実行して新しい通知レコードを作成
   - `/api/cron/send-notifications`を実行して送信待ちの通知を送信

