import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { routing } from "@/src/i18n/routing";
import jaMessages from "@/messages/ja.json";
import enMessages from "@/messages/en.json";

const messages: Record<string, any> = {
  ja: jaMessages,
  en: enMessages,
};

/**
 * APIルートでユーザーのlocaleを取得
 * 優先順位: refererヘッダー > ユーザー設定 > デフォルト
 */
export async function getLocaleFromRequest(request: NextRequest, sessionUserId?: string): Promise<string> {
  // 1. refererヘッダーからロケールを抽出
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const pathSegments = refererUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0 && routing.locales.includes(pathSegments[0] as any)) {
        return pathSegments[0];
      }
    } catch (e) {
      // URL解析に失敗した場合は次の方法を試す
    }
  }

  // 2. セッションからユーザー情報を取得してロケールを取得
  if (sessionUserId) {
    try {
      const user = await getUserById(sessionUserId);
      if (user?.locale && routing.locales.includes(user.locale as any)) {
        return user.locale;
      }
    } catch (e) {
      console.error("[API Helpers] Failed to get user locale:", e);
    }
  }

  // 3. デフォルトロケールを使用
  return routing.defaultLocale;
}

/**
 * APIルートでセッションとlocaleを取得
 */
export async function getSessionAndLocale(request: NextRequest) {
  const session = await auth();
  const locale = await getLocaleFromRequest(request, session?.userId);
  return { session, locale };
}

/**
 * APIルートでエラーメッセージを取得
 */
export function getErrorMessage(locale: string, key: string, params?: Record<string, string | number>): string {
  const localeMessages = messages[locale] || messages.ja;
  const keys = key.split('.');
  let value: any = localeMessages;
  for (const k of keys) {
    value = value?.[k];
  }
  if (typeof value !== 'string') {
    return key;
  }
  if (params) {
    return Object.entries(params).reduce((str, [k, v]) => str.replace(`{${k}}`, String(v)), value);
  }
  return value;
}
