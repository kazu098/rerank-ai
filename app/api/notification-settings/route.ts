import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateNotificationSettings, getNotificationSettings } from "@/lib/db/notification-settings";

/**
 * 通知設定を取得
 * GET /api/notification-settings
 */
export async function GET(request: NextRequest) {
  try {
    console.log("[Notification Settings API] GET request received");
    const session = await auth();
    if (!session?.userId) {
      console.error("[Notification Settings API] Unauthorized: No session or userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId") || undefined;

    console.log("[Notification Settings API] Fetching settings:", {
      userId: session.userId,
      articleId: articleId || null,
    });

    const settings = await getNotificationSettings(session.userId, articleId);

    console.log("[Notification Settings API] Settings retrieved:", {
      hasSettings: !!settings,
      is_enabled: settings?.is_enabled,
      hasSlackBotToken: !!settings?.slack_bot_token,
      slackBotTokenIsNull: settings?.slack_bot_token === null,
      slackChannelId: settings?.slack_channel_id,
      slackNotificationType: settings?.slack_notification_type,
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[Notification Settings API] Error fetching settings:", {
      error: error.message,
      stack: error.stack,
    });
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
    console.log("[Notification Settings API] POST request received");
    const session = await auth();
    if (!session?.userId) {
      console.error("[Notification Settings API] Unauthorized: No session or userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Notification Settings API] User authenticated:", session.userId);

    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error("[Notification Settings API] Failed to parse request body:", {
        error: parseError.message,
        stack: parseError.stack,
      });
      return NextResponse.json(
        { error: "Invalid JSON in request body", details: parseError.message },
        { status: 400 }
      );
    }
    console.log("[Notification Settings API] Request body:", {
      hasSlackBotToken: body.slackBotToken !== undefined,
      slackBotToken: body.slackBotToken === null ? "null" : (body.slackBotToken ? "present" : "undefined"),
      hasSlackUserId: body.slackUserId !== undefined,
      slackUserId: body.slackUserId === null ? "null" : body.slackUserId,
      hasSlackTeamId: body.slackTeamId !== undefined,
      hasSlackChannelId: body.slackChannelId !== undefined,
      hasSlackNotificationType: body.slackNotificationType !== undefined,
      slackNotificationType: body.slackNotificationType,
      articleId: body.articleId,
    });

    const { articleId, slackWebhookUrl, email, notificationTime, timezone } = body;

    // メール通知設定を保存（emailが提供されている場合）
    if (email) {
      console.log("[Notification Settings API] Saving email notification settings");
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
      console.log("[Notification Settings API] Saving Slack webhook settings");
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
      console.log("[Notification Settings API] Updating Slack OAuth settings:", {
        isDisconnecting,
        hasSlackBotToken: slackBotToken !== undefined,
        slackBotTokenIsNull: slackBotToken === null,
        slackUserId: slackUserId === null ? "null" : slackUserId,
        slackChannelId: slackChannelId === null ? "null" : slackChannelId,
        slackNotificationType,
      });

      const settingsToSave = {
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
      };

      console.log("[Notification Settings API] Settings to save:", {
        is_enabled: settingsToSave.is_enabled,
        hasSlackBotToken: settingsToSave.slack_bot_token !== undefined,
        slackBotTokenIsNull: settingsToSave.slack_bot_token === null,
        slackUserId: settingsToSave.slack_user_id,
        slackChannelId: settingsToSave.slack_channel_id,
        slackNotificationType: settingsToSave.slack_notification_type,
      });

      try {
        const savedSettings = await saveOrUpdateNotificationSettings(
          session.userId,
          settingsToSave,
          articleId || null
        );

        console.log("[Notification Settings API] Settings saved:", {
          id: savedSettings.id,
          is_enabled: savedSettings.is_enabled,
          hasSlackBotToken: !!savedSettings.slack_bot_token,
          slackBotTokenIsNull: savedSettings.slack_bot_token === null,
          slackChannelId: savedSettings.slack_channel_id,
          slackNotificationType: savedSettings.slack_notification_type,
        });
      } catch (saveError: any) {
        console.error("[Notification Settings API] Error saving settings:", {
          error: saveError.message,
          stack: saveError.stack,
          settingsToSave: {
            is_enabled: settingsToSave.is_enabled,
            hasSlackBotToken: settingsToSave.slack_bot_token !== undefined,
            slackBotTokenIsNull: settingsToSave.slack_bot_token === null,
          },
        });
        throw saveError;
      }
    }

    console.log("[Notification Settings API] POST request completed successfully");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Notification Settings API] Error in POST handler:", {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });
    return NextResponse.json(
      { 
        error: error.message || "Failed to save notification settings",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

