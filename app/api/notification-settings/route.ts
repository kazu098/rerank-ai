import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateNotificationSettings, getNotificationSettings } from "@/lib/db/notification-settings";

/**
 * 通知設定を取得
 * GET /api/notification-settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId") || undefined;

    const settings = await getNotificationSettings(session.userId, articleId);

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[Notification Settings] Error fetching settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch notification settings" },
      { status: 500 }
    );
  }
}

/**
 * 通知設定を保存
 * POST /api/notification-settings
 * Body: {
 *   articleId?: string,
 *   slackWebhookUrl?: string,
 *   email?: string,
 *   notificationTime?: string,
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
    const { articleId, slackWebhookUrl, email, notificationTime, timezone } = body;

    // メール通知設定を保存（emailが提供されている場合）
    if (email) {
      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'email',
          recipient: email,
          is_enabled: true,
          notification_time: notificationTime || '09:00:00',
          timezone: timezone || null,
        },
        articleId || null
      );
    }

    // Slack通知設定を保存（slackWebhookUrlが提供されている場合 - 旧方式）
    if (slackWebhookUrl !== undefined) {
      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'slack',
          recipient: slackWebhookUrl || '', // Webhook URLをrecipientに保存
          is_enabled: !!slackWebhookUrl,
          slack_webhook_url: slackWebhookUrl || null,
          notification_time: notificationTime || '09:00:00',
          timezone: timezone || null,
        },
        articleId || null
      );
    }

    // Slack OAuth設定の更新（slackBotToken等が提供されている場合）
    const { slackBotToken, slackUserId, slackTeamId, slackChannelId, slackNotificationType } = body;
    // slackBotTokenまたはslackUserIdが明示的に指定されている場合（null含む）に更新
    if (slackBotToken !== undefined || slackUserId !== undefined || slackTeamId !== undefined || slackChannelId !== undefined || slackNotificationType !== undefined) {
      // 連携解除の場合（slackBotTokenがnull）はis_enabledをfalseに設定
      const isDisconnecting = slackBotToken === null;
      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'slack',
          recipient: slackUserId || slackChannelId || '',
          is_enabled: isDisconnecting ? false : (slackBotToken !== null && !!slackBotToken), // 連携解除時はfalse
          slack_bot_token: slackBotToken !== undefined ? (slackBotToken || null) : undefined,
          slack_user_id: slackUserId !== undefined ? (slackUserId || null) : undefined,
          slack_team_id: slackTeamId !== undefined ? (slackTeamId || null) : undefined,
          slack_channel_id: slackChannelId !== undefined ? (slackChannelId || null) : undefined,
          slack_notification_type: slackNotificationType !== undefined ? (slackNotificationType || null) : undefined,
          notification_time: notificationTime || '09:00:00',
          timezone: timezone || null,
        },
        articleId || null
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Notification Settings] Error saving settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save notification settings" },
      { status: 500 }
    );
  }
}

