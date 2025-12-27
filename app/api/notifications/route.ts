import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationsByUserId } from "@/lib/db/notifications";

/**
 * 通知一覧を取得
 * GET /api/notifications?read=true|false|null&limit=10&offset=0
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
    const searchParams = request.nextUrl.searchParams;

    const readParam = searchParams.get("read");
    let read: boolean | null = null;
    if (readParam === "true") {
      read = true;
    } else if (readParam === "false") {
      read = false;
    }

    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const notifications = await getNotificationsByUserId(userId, {
      read,
      limit,
      offset,
    });

    return NextResponse.json({ notifications });
  } catch (error: any) {
    console.error("[Notifications API] Error:", error);
    return NextResponse.json(
      { error: error.message || "通知の取得に失敗しました。" },
      { status: 500 }
    );
  }
}

