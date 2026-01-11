import { getUserByEmail } from '@/lib/db/users';
import { getCheckRankTimeSlot } from '@/lib/cron/slot-calculator';

async function calculateSlot() {
  const email = 'kazutaka.yoshinaga@gmail.com';
  
  try {
    const user = await getUserByEmail(email);
    
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }
    
    const slot = getCheckRankTimeSlot(user.id, 24);
    
    console.log(`User: ${email}`);
    console.log(`User ID: ${user.id}`);
    console.log(`Slot: ${slot}/24`);
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

calculateSlot();
