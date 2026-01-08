import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";

/**
 * 現在のセッションが管理者かどうかをチェック
 * 環境変数 ADMIN_EMAIL で指定されたメールアドレスと一致する場合のみ管理者とみなす
 * 
 * @returns 管理者の場合はtrue、それ以外はfalse
 */
export async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  
  if (!session?.userId) {
    return false;
  }
  
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error("[Admin Auth] ADMIN_EMAIL is not set");
    return false;
  }
  
  try {
    const user = await getUserById(session.userId);
    if (!user) {
      return false;
    }
    
    return user.email === adminEmail;
  } catch (error) {
    console.error("[Admin Auth] Error checking admin status:", error);
    return false;
  }
}

/**
 * 複数の管理者をサポートする場合（将来的な拡張用）
 * 環境変数 ADMIN_EMAILS をカンマ区切りで指定
 * 
 * @returns 管理者の場合はtrue、それ以外はfalse
 */
export async function requireAdminMultiple(): Promise<boolean> {
  const session = await auth();
  
  if (!session?.userId) {
    return false;
  }
  
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()).filter(e => e) || [];
  if (adminEmails.length === 0) {
    // ADMIN_EMAILSが設定されていない場合は、ADMIN_EMAILをチェック
    return await requireAdmin();
  }
  
  try {
    const user = await getUserById(session.userId);
    if (!user) {
      return false;
    }
    
    return adminEmails.includes(user.email);
  } catch (error) {
    console.error("[Admin Auth] Error checking admin status:", error);
    return false;
  }
}
