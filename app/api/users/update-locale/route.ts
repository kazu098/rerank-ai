import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateUserLocale } from "@/lib/db/users";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * ユーザーのロケールを更新
 * POST /api/users/update-locale
 * Body: { locale: 'ja' | 'en' }
 */
export async function POST(request: NextRequest) {
  try {
    const { session, locale: userLocale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(userLocale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { locale } = body;

    if (!locale) {
      return NextResponse.json(
        { error: getErrorMessage(userLocale, "errors.localeRequired") },
        { status: 400 }
      );
    }

    // ロケールの検証
    if (locale !== "ja" && locale !== "en") {
      return NextResponse.json(
        { error: getErrorMessage(userLocale, "errors.invalidLocale") },
        { status: 400 }
      );
    }

    const userId = session.userId as string;

    // ロケールを更新
    await updateUserLocale(userId, locale);

    return NextResponse.json({ success: true, locale });
  } catch (error: any) {
    console.error("[Users API] Error updating locale:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.localeUpdateFailed") },
      { status: 500 }
    );
  }
}

