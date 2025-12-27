import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markNotificationAsRead, getNotificationById } from "@/lib/db/notifications";

/**
 * 通知を既読にする
 * POST /api/notifications/[id]/mark-as-read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const { id } = params;
    const userId = session.userId as string;

    // 通知を取得して所有権を確認
    const notification = await getNotificationById(id);

    if (!notification) {
      return NextResponse.json(
        { error: "通知が見つかりません。" },
        { status: 404 }
      );
    }

    if (notification.user_id !== userId) {
      return NextResponse.json(
        { error: "アクセス権限がありません。" },
        { status: 403 }
      );
    }

    // 既読にする
    await markNotificationAsRead(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Notifications API] Error:", error);
    return NextResponse.json(
      { error: error.message || "通知の既読処理に失敗しました。" },
      { status: 500 }
    );
  }
}

