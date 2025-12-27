import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateArticle } from "@/lib/db/articles";
import { saveOrUpdateNotificationSettings } from "@/lib/db/notification-settings";
import { getSitesByUserId } from "@/lib/db/sites";
import { updateUserTimezone } from "@/lib/db/users";

/**
 * 記事の監視を開始
 * POST /api/articles/start-monitoring
 * Body: { 
 *   url: string,
 *   siteUrl: string,
 *   email: string,
 *   notificationTime?: string (HH:MM形式),
 *   timezone?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, siteUrl, email, notificationTime, timezone } = body;

    if (!url || !siteUrl || !email) {
      return NextResponse.json(
        { error: "Missing required parameters: url, siteUrl, email" },
        { status: 400 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(session.userId);
    const site = sites.find((s) => s.site_url === siteUrl);
    if (!site) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
    }

    // タイムゾーンが提供されている場合、ユーザーのタイムゾーンを更新
    if (timezone) {
      try {
        await updateUserTimezone(session.userId, timezone);
      } catch (error: any) {
        console.error("[Monitoring] Failed to update user timezone:", error);
        // タイムゾーンの更新に失敗しても続行
      }
    }

    // 記事を保存または更新（監視対象として設定）
    const article = await saveOrUpdateArticle(
      session.userId,
      url,
      site.id,
      undefined, // titleは後で取得可能
      undefined // keywordsは後で取得可能
    );

    // 通知設定を保存
    const notificationTimeValue = notificationTime || '09:00:00';
    const effectiveTimezone = timezone || 'UTC';

    await saveOrUpdateNotificationSettings(
      session.userId,
      {
        notification_type: 'rank_drop',
        channel: 'email',
        recipient: email,
        is_enabled: true,
        notification_time: notificationTimeValue,
        timezone: effectiveTimezone,
      },
      article.id
    );

    return NextResponse.json({ 
      success: true, 
      articleId: article.id,
      message: "Monitoring started successfully"
    });
  } catch (error: any) {
    console.error("Error starting monitoring:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start monitoring" },
      { status: 500 }
    );
  }
}

