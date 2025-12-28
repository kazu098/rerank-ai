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
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ユーザーのSlack設定を取得
    const notificationSettings = await getNotificationSettings(session.userId, null);
    
    if (!notificationSettings?.slack_bot_token) {
      return NextResponse.json(
        { error: "Slack is not connected" },
        { status: 400 }
      );
    }

    // チャネル一覧を取得
    const channels = await getSlackChannels(notificationSettings.slack_bot_token);

    return NextResponse.json({ channels });
  } catch (error: any) {
    console.error("[Slack Channels] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch Slack channels" },
      { status: 500 }
    );
  }
}

