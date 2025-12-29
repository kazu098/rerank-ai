import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationSettings, saveOrUpdateNotificationSettings } from "@/lib/db/notification-settings";
import { getSlackIntegrationByUserId } from "@/lib/db/slack-integrations";
import { getArticleById } from "@/lib/db/articles";
import { getUserById } from "@/lib/db/users";

/**
 * 記事ごとの通知設定をトグル
 * POST /api/articles/[id]/notification
 * Body: {
 *   channel: 'email' | 'slack',
 *   enabled: boolean
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("[Article Notification API] POST request received");
    const session = await auth();
    if (!session?.userId) {
      console.error("[Article Notification API] Unauthorized: No session or userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const articleId = params.id;
    const body = await request.json();
    const { channel, enabled } = body;

    if (!channel || (channel !== 'email' && channel !== 'slack')) {
      return NextResponse.json(
        { error: "channel must be 'email' or 'slack'" },
        { status: 400 }
      );
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }

    console.log("[Article Notification API] Toggling notification:", {
      userId: session.userId,
      articleId,
      channel,
      enabled,
    });

    // 記事が存在し、ユーザーのものか確認
    const article = await getArticleById(articleId);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    if (article.user_id !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ユーザー情報を取得（recipient取得用）
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 現在の設定を取得
    const currentSettings = await getNotificationSettings(session.userId, articleId);

    // Slack設定を取得（slack_integrationsテーブルから取得）
    const slackIntegration = await getSlackIntegrationByUserId(session.userId);
    
    console.log("[Article Notification API] Slack integration status:", {
      hasIntegration: !!slackIntegration,
      hasBotToken: !!slackIntegration?.slack_bot_token,
      notificationType: slackIntegration?.slack_notification_type,
      channelId: slackIntegration?.slack_channel_id,
      userId: slackIntegration?.slack_user_id,
    });

    // 通知設定を保存または更新
    if (channel === 'email') {
      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'email',
          recipient: user.email || '',
          is_enabled: enabled,
        },
        articleId
      );
    } else if (channel === 'slack') {
      // Slack設定の場合は、slack_integrationsテーブルから取得した情報を使用
      if (!slackIntegration) {
        return NextResponse.json(
          { error: "Slack is not connected. Please connect Slack in notification settings first." },
          { status: 400 }
        );
      }

      // 通知先が選択されていない場合はエラー
      if (!slackIntegration.slack_notification_type) {
        return NextResponse.json(
          { error: "Please select a notification destination (DM or Channel) in notification settings first." },
          { status: 400 }
        );
      }

      // DMの場合はslack_user_idをrecipientとして使用
      // チャネルの場合はslack_channel_idをrecipientとして使用
      let recipient = '';
      if (slackIntegration.slack_notification_type === 'dm') {
        // DMの場合はslack_user_idを使用（slack_channel_idはnullでもOK）
        if (!slackIntegration.slack_user_id) {
          return NextResponse.json(
            { error: "Slack user ID is missing. Please reconnect Slack in notification settings." },
            { status: 400 }
          );
        }
        recipient = slackIntegration.slack_user_id;
      } else if (slackIntegration.slack_notification_type === 'channel') {
        // チャネルの場合はslack_channel_idが必須
        if (!slackIntegration.slack_channel_id) {
          return NextResponse.json(
            { error: "Please select a Slack channel in notification settings first." },
            { status: 400 }
          );
        }
        recipient = slackIntegration.slack_channel_id;
      }

      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'slack',
          recipient: recipient,
          is_enabled: enabled,
          slack_integration_id: slackIntegration.id,
        },
        articleId
      );
    }

    console.log("[Article Notification API] Notification setting updated successfully");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Article Notification API] Error:", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Failed to update notification setting" },
      { status: 500 }
    );
  }
}

