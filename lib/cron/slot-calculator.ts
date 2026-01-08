/**
 * Cronジョブの時間分散処理用のスロット計算ユーティリティ
 * 
 * ユーザーIDのハッシュ値を使って、1日を複数の時間帯（スロット）に分散
 * 各ユーザーは毎日同じスロットで処理される（一貫性を保つ）
 */

/**
 * シンプルなハッシュ関数
 * 同じ入力に対して常に同じ出力を返す
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * ユーザーIDからcheck-rankの処理スロットを計算
 * 
 * @param userId ユーザーID
 * @param totalSlots 総スロット数（デフォルト: 24 = 1時間ごと）
 * @returns スロット番号（0 ～ totalSlots-1）
 */
export function getCheckRankTimeSlot(userId: string, totalSlots: number = 24): number {
  const hash = simpleHash(userId);
  return hash % totalSlots;
}

/**
 * 現在のUTC時刻からスロット番号を計算
 * 
 * @param totalSlots 総スロット数（デフォルト: 24 = 1時間ごと）
 * @returns スロット番号（0 ～ totalSlots-1）
 */
export function getCurrentTimeSlot(totalSlots: number = 24): number {
  const now = new Date();
  const hours = now.getUTCHours();
  return hours % totalSlots;
}

/**
 * スロット番号からUTC時刻（時）を取得
 * 
 * @param slot スロット番号
 * @param totalSlots 総スロット数（デフォルト: 24 = 1時間ごと）
 * @returns UTC時刻（時、0-23）
 */
export function getSlotHour(slot: number, totalSlots: number = 24): number {
  return slot % totalSlots;
}

/**
 * スロット番号から日本時刻（時）を取得
 * 
 * @param slot スロット番号
 * @param totalSlots 総スロット数（デフォルト: 24 = 1時間ごと）
 * @returns 日本時刻（時、0-23）
 */
export function getSlotHourJST(slot: number, totalSlots: number = 24): number {
  const utcHour = getSlotHour(slot, totalSlots);
  const jstHour = (utcHour + 9) % 24; // UTC+9 = JST
  return jstHour;
}
