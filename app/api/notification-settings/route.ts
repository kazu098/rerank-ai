import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateNotificationSettings, getNotificationSettings, NotificationSettings } from "@/lib/db/notification-settings";
import { getSlackIntegrationByUserId, saveOrUpdateSlackIntegration, deleteSlackIntegration } from "@/lib/db/slack-integrations";
import { getUserById } from "@/lib/db/users";
import { sendSlackNotificationWithBot } from "@/lib/slack-notification";
import jaMessages from "@/messages/ja.json";
import enMessages from "@/messages/en.json";

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

    // Slack連携状態を確認（slack_integrationsテーブルから取得）
    const slackIntegration = await getSlackIntegrationByUserId(session.userId);
    
    const responseData: Partial<NotificationSettings> = settings || {};
    if (slackIntegration) {
      // Slack連携情報を追加
      responseData.slack_bot_token = slackIntegration.slack_bot_token;
      responseData.slack_user_id = slackIntegration.slack_user_id;
      responseData.slack_team_id = slackIntegration.slack_team_id;
      responseData.slack_channel_id = slackIntegration.slack_channel_id;
      responseData.slack_notification_type = slackIntegration.slack_notification_type;
    }

    // Slack連携済みの場合、workspace名とチャネル名を取得
    let slackWorkspaceName: string | null = null;
    let slackChannelName: string | null = null;
    if (responseData.slack_bot_token && responseData.slack_team_id) {
      try {
        // Workspace情報を取得
        const teamInfoResponse = await fetch('https://slack.com/api/team.info', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${responseData.slack_bot_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            team: responseData.slack_team_id,
          }),
        });

        if (teamInfoResponse.ok) {
          const teamInfoData = await teamInfoResponse.json();
          if (teamInfoData.ok && teamInfoData.team) {
            slackWorkspaceName = teamInfoData.team.name;
          }
        }

        // チャネル名を取得（チャネルIDが指定されている場合）
        if (responseData.slack_channel_id && responseData.slack_notification_type === 'channel') {
          const { getSlackChannels } = await import("@/lib/slack-channels");
          try {
            const channels = await getSlackChannels(responseData.slack_bot_token);
            const channel = channels.find((ch) => ch.id === responseData.slack_channel_id);
            if (channel) {
              slackChannelName = channel.name;
            }
          } catch (channelError: any) {
            console.error("[Notification Settings API] Error fetching channel name:", channelError);
            // チャネル名の取得に失敗しても続行
          }
        }
      } catch (error: any) {
        console.error("[Notification Settings API] Error fetching Slack workspace info:", error);
        // workspace情報の取得に失敗しても続行
      }
    }

    const finalResponseData = {
      ...responseData,
      slack_workspace_name: slackWorkspaceName,
      slack_channel_name: slackChannelName,
    };

    console.log("[Notification Settings API] Settings retrieved:", {
      hasSettings: !!settings,
      is_enabled: settings?.is_enabled,
      hasSlackBotToken: !!responseData.slack_bot_token,
      slackBotTokenIsNull: responseData.slack_bot_token === null,
      slackChannelId: responseData.slack_channel_id,
      slackNotificationType: responseData.slack_notification_type,
      slackWorkspaceName,
      slackChannelName,
    });

    return NextResponse.json(finalResponseData);
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
 *   email?: string,
 *   notificationTime?: string,
 *   timezone?: string,
 *   slackBotToken?: string | null,
 *   slackUserId?: string | null,
 *   slackTeamId?: string | null,
 *   slackChannelId?: string | null,
 *   slackNotificationType?: string | null
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

    const { articleId, email } = body;

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
        },
        articleId || null
      );
    }

    // Slack OAuth設定の更新（slackBotToken等が提供されている場合）
    const { slackBotToken, slackUserId, slackTeamId, slackChannelId, slackNotificationType } = body;
    // slackBotTokenまたはslackUserIdが明示的に指定されている場合（null含む）に更新
    if (slackBotToken !== undefined || slackUserId !== undefined || slackTeamId !== undefined || slackChannelId !== undefined || slackNotificationType !== undefined) {
      // 連携解除の場合（slackBotTokenがnull）は削除
      const isDisconnecting = slackBotToken === null;
      console.log("[Notification Settings API] Updating Slack OAuth settings:", {
        isDisconnecting,
        hasSlackBotToken: slackBotToken !== undefined,
        slackBotTokenIsNull: slackBotToken === null,
        slackUserId: slackUserId === null ? "null" : slackUserId,
        slackChannelId: slackChannelId === null ? "null" : slackChannelId,
        slackNotificationType,
      });

      try {
        if (isDisconnecting) {
          // 連携解除
          await deleteSlackIntegration(session.userId);
          console.log("[Notification Settings API] Slack integration deleted");
        } else {
          // 既存のSlack連携情報を取得
          const existingIntegration = await getSlackIntegrationByUserId(session.userId);
          
          if (!existingIntegration && (!slackBotToken || !slackTeamId)) {
            // 新規連携の場合、slackBotTokenとslackTeamIdが必須
            return NextResponse.json(
              { error: "Slack bot token and team ID are required for new integration" },
              { status: 400 }
            );
          }

          // 連携作成または更新（既存の情報を保持しつつ、提供された値で更新）
          const integrationData: {
            slack_bot_token: string;
            slack_user_id?: string | null;
            slack_team_id: string;
            slack_channel_id?: string | null;
            slack_notification_type?: 'channel' | 'dm' | null;
          } = {
            slack_bot_token: slackBotToken || existingIntegration!.slack_bot_token,
            slack_team_id: slackTeamId || existingIntegration!.slack_team_id,
          };

          // 提供された値があれば使用、なければ既存の値を使用
          if (slackUserId !== undefined) {
            integrationData.slack_user_id = slackUserId;
          } else if (existingIntegration) {
            integrationData.slack_user_id = existingIntegration.slack_user_id;
          }

          if (slackChannelId !== undefined) {
            integrationData.slack_channel_id = slackChannelId;
          } else if (existingIntegration) {
            integrationData.slack_channel_id = existingIntegration.slack_channel_id;
          }

          if (slackNotificationType !== undefined) {
            integrationData.slack_notification_type = slackNotificationType as 'channel' | 'dm' | null;
          } else if (existingIntegration) {
            integrationData.slack_notification_type = existingIntegration.slack_notification_type;
          }

          const savedIntegration = await saveOrUpdateSlackIntegration(session.userId, integrationData);

          console.log("[Notification Settings API] Slack integration saved:", {
            id: savedIntegration.id,
            channelId: savedIntegration.slack_channel_id,
            notificationType: savedIntegration.slack_notification_type,
          });

          // チャネルまたはDMが選択された場合、挨拶メッセージを送信
          if (
            savedIntegration.slack_channel_id &&
            savedIntegration.slack_notification_type &&
            (slackChannelId !== undefined || slackNotificationType !== undefined)
          ) {
            try {
              console.log("[Notification Settings API] Sending greeting message to Slack:", {
                channelId: savedIntegration.slack_channel_id,
                notificationType: savedIntegration.slack_notification_type,
              });

              // ユーザーのロケールを取得
              const user = await getUserById(session.userId);
              const locale = (user?.locale || 'ja') as 'ja' | 'en';

              // 翻訳ファイルから挨拶メッセージを取得
              const messages = (locale === 'en' ? enMessages : jaMessages) as any;
              const greeting = {
                text: messages.notification.settings.greetingTitle,
                message: messages.notification.settings.greetingMessage,
              };

              const greetingPayload = {
                text: greeting.text,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: greeting.message,
                    },
                  },
                ],
              };

              await sendSlackNotificationWithBot(
                savedIntegration.slack_bot_token,
                savedIntegration.slack_channel_id,
                greetingPayload
              );

              console.log("[Notification Settings API] Greeting message sent successfully");
            } catch (greetingError: any) {
              // 挨拶メッセージの送信に失敗しても、設定の保存は成功しているので続行
              console.error("[Notification Settings API] Failed to send greeting message:", {
                error: greetingError.message,
                stack: greetingError.stack,
              });
              // エラーはログに記録するが、設定保存の成功は返す
            }
          }
        }
      } catch (saveError: any) {
        console.error("[Notification Settings API] Error saving Slack integration:", {
          error: saveError.message,
          stack: saveError.stack,
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

