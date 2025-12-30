import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { getSlackChannels } from "@/lib/slack-channels";

/**
 * Slackチャネル一覧を取得
 * GET /api/slack/channels
 */
export async function GET(request: NextRequest) {
  try {
    console.log("[Slack Channels API] Request received");
    const session = await auth();
    if (!session?.userId) {
      console.error("[Slack Channels API] Unauthorized: No session or userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Slack Channels API] User authenticated:", session.userId);

    // ユーザーのSlack設定を取得
    const notificationSettings = await getNotificationSettings(session.userId, null);
    
    // Slack連携状態を確認（is_enabledに関わらずslack_bot_tokenの存在を確認）
    let slackBotToken = notificationSettings?.slack_bot_token;
    
    // notification_settingsから取得できない場合は、slack_integrationsテーブルから直接取得
    if (!slackBotToken) {
      const { getSlackIntegrationByUserId } = await import("@/lib/db/slack-integrations");
      const slackIntegration = await getSlackIntegrationByUserId(session.userId);
      if (slackIntegration) {
        slackBotToken = slackIntegration.slack_bot_token;
        console.log("[Slack Channels API] Found Slack integration from slack_integrations table");
      }
    }
    
    console.log("[Slack Channels API] Notification settings:", {
      hasSettings: !!notificationSettings,
      hasBotToken: !!slackBotToken,
      botTokenPrefix: slackBotToken?.substring(0, 10) + '...',
    });
    
    if (!slackBotToken) {
      console.error("[Slack Channels API] Slack is not connected");
      return NextResponse.json(
        { error: "Slack is not connected" },
        { status: 400 }
      );
    }

    // チャネル一覧を取得
    console.log("[Slack Channels API] Fetching channels...");
    const channels = await getSlackChannels(slackBotToken);
    console.log("[Slack Channels API] Channels fetched successfully:", channels.length, "channels");

    return NextResponse.json({ channels });
  } catch (error: any) {
    console.error("[Slack Channels API] Error:", {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });
    return NextResponse.json(
      { 
        error: error.message || "Failed to fetch Slack channels",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

