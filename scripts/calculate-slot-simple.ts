/**
 * ユーザーIDからslot番号を計算するスクリプト
 * 使用方法: npx tsx scripts/calculate-slot-simple.ts <user_id>
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
 */
function getCheckRankTimeSlot(userId: string, totalSlots: number = 24): number {
  const hash = simpleHash(userId);
  return hash % totalSlots;
}

// コマンドライン引数からユーザーIDを取得
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: npx tsx scripts/calculate-slot-simple.ts <user_id>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/calculate-slot-simple.ts 6e22816d-abee-480e-af28-3cc9d37a9884');
  process.exit(1);
}

const slot = getCheckRankTimeSlot(userId, 24);
console.log(`User ID: ${userId}`);
console.log(`Slot: ${slot}/24`);
