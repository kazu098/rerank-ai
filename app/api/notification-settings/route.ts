import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateNotificationSettings, getNotificationSettings } from "@/lib/db/notification-settings";
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

    // Slack連携状態を確認（is_enabledに関わらずslack_bot_tokenの存在を確認）
    let slackConnectionInfo = null;
    if (!settings?.slack_bot_token) {
      const { createSupabaseClient } = await import("@/lib/supabase");
      const supabase = createSupabaseClient();
      const { data: slackSettingsData } = await supabase
        .from('notification_settings')
        .select('slack_bot_token, slack_user_id, slack_team_id, slack_channel_id, slack_notification_type')
        .eq('user_id', session.userId)
        .is('article_id', null)
        .eq('channel', 'slack')
        .not('slack_bot_token', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (slackSettingsData) {
        slackConnectionInfo = {
          slack_bot_token: slackSettingsData.slack_bot_token,
          slack_user_id: slackSettingsData.slack_user_id,
          slack_team_id: slackSettingsData.slack_team_id,
          slack_channel_id: slackSettingsData.slack_channel_id,
          slack_notification_type: slackSettingsData.slack_notification_type,
        };
      }
    }

    const responseData = settings || {};
    if (slackConnectionInfo) {
      // Slack連携情報を追加（is_enabled=falseでもslack_bot_tokenが存在する場合）
      Object.assign(responseData, slackConnectionInfo);
    }

    // Slack連携済みの場合、workspace名とチャネル名を取得
    let slackWorkspaceName = null;
    let slackChannelName = null;
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

        // チャネルまたはDMが選択された場合、挨拶メッセージを送信
        if (
          !isDisconnecting &&
          savedSettings.slack_bot_token &&
          savedSettings.slack_channel_id &&
          savedSettings.slack_notification_type &&
          (slackChannelId !== undefined || slackNotificationType !== undefined)
        ) {
          try {
            console.log("[Notification Settings API] Sending greeting message to Slack:", {
              channelId: savedSettings.slack_channel_id,
              notificationType: savedSettings.slack_notification_type,
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
              savedSettings.slack_bot_token,
              savedSettings.slack_channel_id,
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

