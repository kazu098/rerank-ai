/**
 * タイムゾーン関連のユーティリティ関数
 */

/**
 * 指定されたタイムゾーンで現在時刻が通知時刻に達しているかチェック
 * @param timezone タイムゾーン（例: 'Asia/Tokyo', 'America/New_York'）
 * @param notificationTime 通知時刻（HH:MM形式、例: '09:00'）
 * @param toleranceMinutes 許容範囲（分）。デフォルトは5分（Cronジョブの実行間隔を考慮）
 * @returns 通知時刻に達している場合true
 */
export function isNotificationTime(
  timezone: string,
  notificationTime: string,
  toleranceMinutes: number = 5
): boolean {
  try {
    // 通知時刻をパース（HH:MM形式）
    const [hours, minutes] = notificationTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.error(`[Timezone] Invalid notification time format: ${notificationTime}`);
      return false;
    }

    // 指定されたタイムゾーンで現在時刻を取得
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    // 現在時刻を分に変換
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const notificationTotalMinutes = hours * 60 + minutes;

    // 許容範囲内かチェック
    const diff = Math.abs(currentTotalMinutes - notificationTotalMinutes);
    
    // 24時間を跨ぐ場合を考慮（例: 23:55 → 00:05）
    const diff24 = Math.abs(diff - 24 * 60);
    const minDiff = Math.min(diff, diff24);

    return minDiff <= toleranceMinutes;
  } catch (error) {
    console.error(`[Timezone] Error checking notification time for timezone ${timezone}:`, error);
    return false;
  }
}

/**
 * 指定されたタイムゾーンで現在時刻を取得
 * @param timezone タイムゾーン（例: 'Asia/Tokyo'）
 * @returns 現在時刻（HH:MM形式）
 */
export function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';

    return `${hour}:${minute}`;
  } catch (error) {
    console.error(`[Timezone] Error getting current time for timezone ${timezone}:`, error);
    return '00:00';
  }
}

/**
 * ブラウザのタイムゾーンを取得
 * @returns タイムゾーン（例: 'Asia/Tokyo'）
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('[Timezone] Error getting browser timezone:', error);
    return 'UTC';
  }
}


