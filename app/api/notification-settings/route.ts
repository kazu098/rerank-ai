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

    // 通知時刻のみが更新される場合（email、slackWebhookUrl、slackBotToken等がすべてundefined）
    const isNotificationTimeOnly = 
      email === undefined && 
      slackWebhookUrl === undefined && 
      body.slackBotToken === undefined &&
      body.slackUserId === undefined &&
      body.slackTeamId === undefined &&
      body.slackChannelId === undefined &&
      body.slackNotificationType === undefined &&
      notificationTime !== undefined;

    if (isNotificationTimeOnly && notificationTime) {
      // 既存のメール通知設定を取得して更新（channel='email'で検索）
      const { createSupabaseClient } = await import("@/lib/supabase");
      const supabase = createSupabaseClient();
      const { data: emailSettingsData } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', session.userId)
        .is('article_id', null)
        .eq('channel', 'email')
        .eq('is_enabled', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (emailSettingsData) {
        const existingEmailSettings = emailSettingsData as any;
        await saveOrUpdateNotificationSettings(
          session.userId,
          {
            notification_type: 'rank_drop',
            channel: 'email',
            recipient: existingEmailSettings.recipient,
            is_enabled: existingEmailSettings.is_enabled,
            notification_time: notificationTime,
            timezone: existingEmailSettings.timezone,
            drop_threshold: existingEmailSettings.drop_threshold,
            keyword_drop_threshold: existingEmailSettings.keyword_drop_threshold,
            comparison_days: existingEmailSettings.comparison_days,
            consecutive_drop_days: existingEmailSettings.consecutive_drop_days,
            min_impressions: existingEmailSettings.min_impressions,
            notification_cooldown_days: existingEmailSettings.notification_cooldown_days,
          },
          null
        );
      }

      // 既存のSlack通知設定を取得して更新（channel='slack'で検索）
      const { data: slackSettingsData } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', session.userId)
        .is('article_id', null)
        .eq('channel', 'slack')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (slackSettingsData) {
        const existingSlackSettings = slackSettingsData as any;
        await saveOrUpdateNotificationSettings(
          session.userId,
          {
            notification_type: 'rank_drop',
            channel: 'slack',
            recipient: existingSlackSettings.recipient,
            is_enabled: existingSlackSettings.is_enabled,
            notification_time: notificationTime,
            timezone: existingSlackSettings.timezone,
            slack_bot_token: existingSlackSettings.slack_bot_token,
            slack_user_id: existingSlackSettings.slack_user_id,
            slack_team_id: existingSlackSettings.slack_team_id,
            slack_channel_id: existingSlackSettings.slack_channel_id,
            slack_notification_type: existingSlackSettings.slack_notification_type,
            slack_webhook_url: existingSlackSettings.slack_webhook_url,
            drop_threshold: existingSlackSettings.drop_threshold,
            keyword_drop_threshold: existingSlackSettings.keyword_drop_threshold,
            comparison_days: existingSlackSettings.comparison_days,
            consecutive_drop_days: existingSlackSettings.consecutive_drop_days,
            min_impressions: existingSlackSettings.min_impressions,
            notification_cooldown_days: existingSlackSettings.notification_cooldown_days,
          },
          null
        );
      }

      // メールもSlackも設定されていない場合は、デフォルトのメール通知設定を作成
      if (!emailSettingsData && !slackSettingsData) {
        // ユーザー情報を取得してメールアドレスを取得
        const { getUserById } = await import("@/lib/db/users");
        const user = await getUserById(session.userId);
        if (user?.email) {
          await saveOrUpdateNotificationSettings(
            session.userId,
            {
              notification_type: 'rank_drop',
              channel: 'email',
              recipient: user.email,
              is_enabled: true,
              notification_time: notificationTime,
              timezone: timezone || null,
            },
            null
          );
        }
      }

      console.log("[Notification Settings API] Notification time updated successfully");
      return NextResponse.json({ success: true });
    }

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

