import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateUserLocale } from "@/lib/db/users";

/**
 * ユーザーのロケールを更新
 * POST /api/users/update-locale
 * Body: { locale: 'ja' | 'en' }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { locale } = body;

    if (!locale) {
      return NextResponse.json(
        { error: "localeが必要です。" },
        { status: 400 }
      );
    }

    // ロケールの検証
    if (locale !== "ja" && locale !== "en") {
      return NextResponse.json(
        { error: "無効なロケールです。'ja' または 'en' のみサポートされています。" },
        { status: 400 }
      );
    }

    const userId = session.userId as string;

    // ロケールを更新
    await updateUserLocale(userId, locale);

    return NextResponse.json({ success: true, locale });
  } catch (error: any) {
    console.error("[Users API] Error updating locale:", error);
    return NextResponse.json(
      { error: error.message || "ロケールの更新に失敗しました。" },
      { status: 500 }
    );
  }
}

