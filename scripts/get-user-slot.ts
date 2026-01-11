/**
 * メールアドレスからユーザーIDを取得してslot番号を計算
 * 使用方法: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/get-user-slot.ts <email>
 */

import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/get-user-slot.ts <email>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * シンプルなハッシュ関数
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
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

async function main() {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .is('deleted_at', null)
    .single();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const slot = getCheckRankTimeSlot(user.id, 24);
  
  console.log(`Email: ${user.email}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Slot: ${slot}/24`);
}

main();
