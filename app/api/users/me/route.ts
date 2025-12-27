import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";

/**
 * 現在のユーザー情報を取得
 * GET /api/users/me
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const userId = session.userId as string;

    // ユーザー情報を取得
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません。" },
        { status: 404 }
      );
    }

    // 必要な情報のみを返す
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale || "ja",
      timezone: user.timezone || null,
    });
  } catch (error: any) {
    console.error("[Users API] Error:", error);
    return NextResponse.json(
      { error: error.message || "ユーザー情報の取得に失敗しました。" },
      { status: 500 }
    );
  }
}

