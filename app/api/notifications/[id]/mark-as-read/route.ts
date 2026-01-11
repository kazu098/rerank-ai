import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markNotificationAsRead, getNotificationById } from "@/lib/db/notifications";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 通知を既読にする
 * POST /api/notifications/[id]/mark-as-read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const { id } = params;
    const userId = session.userId as string;

    // 通知を取得して所有権を確認
    const notification = await getNotificationById(id);

    if (!notification) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.notificationNotFound") },
        { status: 404 }
      );
    }

    if (notification.user_id !== userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.accessDenied") },
        { status: 403 }
      );
    }

    // 既読にする
    await markNotificationAsRead(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Notifications API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.notificationMarkReadFailed") },
      { status: 500 }
    );
  }
}

