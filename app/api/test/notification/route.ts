import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { sendSlackNotification, sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { createSupabaseClient } from "@/lib/supabase";

/**
 * テスト用の通知送信エンドポイント
 * GET /api/test/notification
 * 
 * 本番環境で通知機能をテストするためのエンドポイントです。
 * ダミーデータを使用してメールとSlack通知を送信します。
 * 
 * 認証が必要です（ログインしているユーザーのみ使用可能）。
 */
export async function GET(request: NextRequest) {
  try {
    console.log("[Test Notification] Starting test notification...");

    // 認証チェック
    const session = await auth();
    if (!session?.userId) {
      console.error("[Test Notification] Unauthorized: No session or userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Test Notification] User authenticated:", session.userId);

    // ユーザー情報を取得
    const user = await getUserById(session.userId);
    if (!user || !user.email) {
      console.error("[Test Notification] User not found or email missing:", session.userId);
      return NextResponse.json(
        { error: "User not found or email missing" },
        { status: 404 }
      );
    }

    console.log("[Test Notification] User found:", {
      id: user.id,
      email: user.email,
      locale: user.locale,
    });

    // 通知設定を取得
          const notificationSettings = await getNotificationSettings(user.id, null);
          console.log("[Test Notification] Notification settings:", {
            hasEmailSettings: !!notificationSettings,
            hasSlackBotToken: !!notificationSettings?.slack_bot_token,
            slackChannelId: notificationSettings?.slack_channel_id,
            slackNotificationType: notificationSettings?.slack_notification_type,
          });

    if (!notificationSettings) {
      console.warn("[Test Notification] No notification settings found");
      return NextResponse.json(
        { error: "Notification settings not found. Please configure notifications first." },
        { status: 400 }
      );
    }

    // ユーザーのロケール設定を取得（デフォルト: 'ja'）
    const locale = (user.locale || "ja") as "ja" | "en";

    // ダミーデータを作成
    const dummyItems: BulkNotificationItem[] = [
      {
        articleUrl: "https://example.com/test-article",
        articleTitle: "【テスト】順位下落通知のテスト記事",
        analysisResult: {
          prioritizedKeywords: [
            {
              keyword: "テストキーワード1",
              priority: 1000,
              impressions: 1000,
              clicks: 50,
              position: 5.0,
            },
            {
              keyword: "テストキーワード2",
              priority: 800,
              impressions: 800,
              clicks: 40,
              position: 7.0,
            },
          ],
          competitorResults: [],
          uniqueCompetitorUrls: [],
        },
        rankDropInfo: {
          baseAveragePosition: 5.5,
          currentAveragePosition: 8.2,
          dropAmount: 2.7,
          droppedKeywords: [
            {
              keyword: "テストキーワード1",
              position: 5.0,
              impressions: 1000,
            },
            {
              keyword: "テストキーワード2",
              position: 7.0,
              impressions: 800,
            },
          ],
        },
      },
    ];

    console.log("[Test Notification] Dummy data created:", {
      itemCount: dummyItems.length,
      articleUrl: dummyItems[0].articleUrl,
    });

    const results = {
      email: { success: false, error: null as string | null },
      slack: { success: false, error: null as string | null },
    };

    // メール通知を送信
    console.log("[Test Notification] Attempting to send email notification...");
    try {
      const notificationService = new NotificationService();
      await notificationService.sendBulkNotification({
        to: user.email,
        items: dummyItems,
        locale,
      });
      results.email.success = true;
      console.log("[Test Notification] Email notification sent successfully");
    } catch (emailError: any) {
      results.email.success = false;
      results.email.error = emailError.message || "Unknown error";
      console.error("[Test Notification] Failed to send email notification:", {
        error: emailError.message,
        stack: emailError.stack,
        email: user.email,
      });
    }

          // Slack通知を送信（OAuth方式のみ）
          if (notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id) {
            console.log("[Test Notification] Attempting to send Slack notification...");
            try {
              const slackPayload = formatSlackBulkNotification(
                dummyItems.map((item) => ({
                  url: item.articleUrl,
                  title: item.articleTitle ?? null,
                  averagePositionChange: {
                    from: item.rankDropInfo.baseAveragePosition,
                    to: item.rankDropInfo.currentAveragePosition,
                    change: item.rankDropInfo.dropAmount,
                  },
                })),
                locale
              );

              console.log("[Test Notification] Slack payload created:", {
                hasText: !!slackPayload.text,
                blocksCount: slackPayload.blocks?.length || 0,
              });

              console.log("[Test Notification] Sending Slack notification via OAuth (Bot Token)...", {
                hasBotToken: !!notificationSettings.slack_bot_token,
                channelId: notificationSettings.slack_channel_id,
                notificationType: notificationSettings.slack_notification_type,
              });
              await sendSlackNotificationWithBot(
                notificationSettings.slack_bot_token,
                notificationSettings.slack_channel_id,
                slackPayload
              );
              results.slack.success = true;
              console.log("[Test Notification] Slack notification sent via OAuth successfully");
            } catch (slackError: any) {
              results.slack.success = false;
              results.slack.error = slackError.message || "Unknown error";
              console.error("[Test Notification] Failed to send Slack notification:", {
                error: slackError.message,
                stack: slackError.stack,
                hasBotToken: !!notificationSettings.slack_bot_token,
                channelId: notificationSettings.slack_channel_id,
              });
            }
          } else {
            console.warn("[Test Notification] Slack notification skipped: No Slack settings configured");
            results.slack.error = "No Slack bot token or channel ID configured";
          }

    // 通知履歴をDBに保存（オプション）
    try {
      const supabase = createSupabaseClient();
      
      // メール通知履歴
      if (results.email.success) {
        const { error: emailNotificationError } = await supabase.from("notifications").insert({
          user_id: user.id,
          article_id: null,
          notification_type: "rank_drop",
          channel: "email",
          recipient: user.email,
          subject: "【ReRank AI】[テスト] 順位下落を検知しました",
          summary: "[テスト通知] 順位下落が検知されました（テスト用のダミーデータ）",
          sent_at: new Date().toISOString(),
        });

        if (emailNotificationError) {
          console.error("[Test Notification] Failed to save email notification history:", emailNotificationError);
        } else {
          console.log("[Test Notification] Email notification history saved");
        }
      }

      // Slack通知履歴
      if (results.slack.success && notificationSettings) {
        const { error: slackNotificationError } = await supabase.from("notifications").insert({
          user_id: user.id,
          article_id: null,
          notification_type: "rank_drop",
          channel: "slack",
          recipient: notificationSettings.slack_channel_id || "",
          subject: "【ReRank AI】[テスト] 順位下落を検知しました",
          summary: "[テスト通知] 順位下落が検知されました（テスト用のダミーデータ）",
          sent_at: new Date().toISOString(),
        });

        if (slackNotificationError) {
          console.error("[Test Notification] Failed to save Slack notification history:", slackNotificationError);
        } else {
          console.log("[Test Notification] Slack notification history saved");
        }
      }
    } catch (historyError: any) {
      console.error("[Test Notification] Failed to save notification history:", historyError);
      // 履歴保存のエラーは通知送信の成功を妨げない
    }

    const response = {
      message: "Test notification completed",
      results,
      timestamp: new Date().toISOString(),
    };

    console.log("[Test Notification] Test notification completed:", response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Test Notification] Error in test notification:", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

