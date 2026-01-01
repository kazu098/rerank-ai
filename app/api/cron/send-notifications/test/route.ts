import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getUserById } from "@/lib/db/users";
import { getUserAlertSettings } from "@/lib/db/alert-settings";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { getSlackIntegrationByUserId } from "@/lib/db/slack-integrations";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { isNotificationTime, getCurrentTimeInTimezone } from "@/lib/timezone-utils";
import { updateArticleNotificationSent } from "@/lib/db/articles";

/**
 * テスト用: 通知送信を手動実行
 * 
 * 認証: 環境変数 CRON_SECRET で認証
 * 使用方法:
 *   curl -X GET "http://localhost:3000/api/cron/send-notifications/test?skipTimeCheck=true" \
 *        -H "Authorization: Bearer YOUR_CRON_SECRET"
 *   または
 *   curl -X POST "http://localhost:3000/api/cron/send-notifications/test?skipTimeCheck=true" \
 *        -H "Authorization: Bearer YOUR_CRON_SECRET"
 * 
 * クエリパラメータ:
 *   - skipTimeCheck: true の場合、通知時刻チェックをスキップして即座に送信
 *   - dryRun: true の場合、通知は送信せずログのみ出力
 */
async function handleRequest(request: NextRequest) {
  // テスト用の認証（環境変数 CRON_SECRET を使用）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized. Set CRON_SECRET environment variable." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const skipTimeCheck = searchParams.get("skipTimeCheck") === "true";
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    console.log("[Test Send Notifications Cron] Starting notification send job...", { skipTimeCheck, dryRun });

    const supabase = createSupabaseClient();

    // sent_at IS NULLの通知を取得
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .is("sent_at", null)
      .order("created_at", { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch pending notifications: ${fetchError.message}`);
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log("[Test Send Notifications Cron] No pending notifications");
      return NextResponse.json({ 
        message: "No pending notifications", 
        sentCount: 0,
        pendingCount: 0,
      });
    }

    console.log(`[Test Send Notifications Cron] Found ${pendingNotifications.length} pending notifications`);

    // ユーザーごとに通知をまとめる
    const notificationsByUser: Map<
      string,
      {
        user: { id: string; email: string; name: string | null; locale: string | null };
        notifications: typeof pendingNotifications;
      }
    > = new Map();

    for (const notification of pendingNotifications) {
      if (!notificationsByUser.has(notification.user_id)) {
        const user = await getUserById(notification.user_id);
        if (!user || !user.email) {
          console.warn(`[Test Send Notifications Cron] User not found or email missing for notification ${notification.id}`);
          continue;
        }
        notificationsByUser.set(notification.user_id, {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            locale: user.locale,
          },
          notifications: [],
        });
      }
      notificationsByUser.get(notification.user_id)!.notifications.push(notification);
    }

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // 各ユーザーに対して通知を送信
    for (const [userId, { user, notifications }] of notificationsByUser.entries()) {
      try {
        // ユーザーのアラート設定を取得（通知時刻を確認するため）
        const userAlertSettings = await getUserAlertSettings(user.id);
        const notificationFrequency = userAlertSettings.notification_frequency || 'daily';

        // 通知頻度に応じて通知を送信するかどうかを判定
        if (notificationFrequency === 'none') {
          console.log(`[Test Send Notifications Cron] Skipping notification for user ${user.email}: notification_frequency is 'none'`);
          skippedCount++;
          continue;
        }

        if (notificationFrequency === 'weekly') {
          // 週1回通知：月曜日に送信
          const now = new Date();
          const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          if (dayOfWeek !== 1) {
            console.log(`[Test Send Notifications Cron] Skipping notification for user ${user.email}: notification_frequency is 'weekly' but today is not Monday (dayOfWeek: ${dayOfWeek})`);
            skippedCount++;
            continue;
          }
        }

        // 通知時刻をチェック（skipTimeCheckがfalseの場合のみ）
        if (!skipTimeCheck) {
          // user_alert_settingsのtimezoneがnullの場合は、usersテーブルから取得を試みる
          let userTimezone = userAlertSettings.timezone;
          if (!userTimezone) {
            const userWithTimezone = await getUserById(user.id);
            userTimezone = userWithTimezone?.timezone || 'UTC';
          }
          const notificationTime = userAlertSettings.notification_time || '09:00:00';
          // notification_timeは'HH:MM:SS'形式なので、'HH:MM'形式に変換
          const notificationTimeHHMM = notificationTime.substring(0, 5);

          // 現在時刻を取得してログに出力
          const currentTimeInTimezone = getCurrentTimeInTimezone(userTimezone);
          // GitHub ActionsのCronジョブの遅延を考慮して許容範囲を20分に設定
          const isTimeMatch = isNotificationTime(userTimezone, notificationTimeHHMM, 20);
          
          console.log(`[Test Send Notifications Cron] Notification time check for user ${user.email}:`, {
            timezone: userTimezone,
            notificationTime: notificationTimeHHMM,
            currentTime: currentTimeInTimezone,
            isTimeMatch,
            toleranceMinutes: 20,
          });
          
          if (!isTimeMatch) {
            console.log(`[Test Send Notifications Cron] Skipping notification for user ${user.email}: current time (${currentTimeInTimezone} in ${userTimezone}) is not notification time (${notificationTimeHHMM})`);
            skippedCount++;
            continue;
          }
        } else {
          console.log(`[Test Send Notifications Cron] Skipping time check for user ${user.email} (skipTimeCheck=true)`);
        }

        console.log(`[Test Send Notifications Cron] Notification time check passed for user ${user.email}: timezone=${userAlertSettings.timezone || 'UTC'}, notification_time=${userAlertSettings.notification_time || '09:00:00'}`);

        if (dryRun) {
          console.log(`[Test Send Notifications Cron] [DRY RUN] Would send ${notifications.length} notifications to user ${user.email}`);
          sentCount++;
          continue;
        }

        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // 通知設定を取得（Slack通知を取得するため）
        let notificationSettings = await getNotificationSettings(user.id);
        
        // notification_settingsテーブルにレコードがない場合、またはslack_bot_tokenがnullの場合、slack_integrationsテーブルから直接取得
        if (!notificationSettings || !notificationSettings.slack_bot_token) {
          if (!notificationSettings) {
            console.log(`[Test Send Notifications Cron] No notification_settings found for user ${user.email}, trying to get Slack integration directly...`);
          } else {
            console.log(`[Test Send Notifications Cron] notification_settings found but slack_bot_token is null for user ${user.email}, trying to get Slack integration directly...`);
          }
          const slackIntegration = await getSlackIntegrationByUserId(user.id);
          if (slackIntegration) {
            // NotificationSettings形式に変換
            notificationSettings = {
              id: notificationSettings?.id || '',
              user_id: user.id,
              article_id: notificationSettings?.article_id || null,
              notification_type: notificationSettings?.notification_type || 'rank_drop',
              channel: notificationSettings?.channel || 'slack',
              recipient: slackIntegration.slack_channel_id || '',
              is_enabled: notificationSettings?.is_enabled ?? true,
              slack_integration_id: slackIntegration.id,
              slack_bot_token: slackIntegration.slack_bot_token,
              slack_user_id: slackIntegration.slack_user_id,
              slack_team_id: slackIntegration.slack_team_id,
              slack_channel_id: slackIntegration.slack_channel_id,
              slack_notification_type: slackIntegration.slack_notification_type,
              created_at: notificationSettings?.created_at || slackIntegration.created_at,
              updated_at: notificationSettings?.updated_at || slackIntegration.updated_at,
            };
            console.log(`[Test Send Notifications Cron] Found Slack integration directly from slack_integrations table for user ${user.email}`);
          }
        }

        // 通知をメール通知とSlack通知に分類
        const emailNotifications = notifications.filter((n) => n.channel === "email");
        const slackNotifications = notifications.filter((n) => n.channel === "slack");
        
        console.log(`[Test Send Notifications Cron] Notification breakdown for user ${user.email}:`, {
          totalNotifications: notifications.length,
          emailNotifications: emailNotifications.length,
          slackNotifications: slackNotifications.length,
          hasSlackSettings: !!(notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id),
          slackBotTokenExists: !!notificationSettings?.slack_bot_token,
          slackChannelId: notificationSettings?.slack_channel_id,
          notificationSettingsExists: !!notificationSettings,
        });

        // メール通知を送信
        if (emailNotifications.length > 0) {
          // notification_dataからBulkNotificationItemに変換
          const items: BulkNotificationItem[] = emailNotifications
            .filter((notification) => notification.notification_data) // notification_dataが存在するもののみ
            .map((notification) => {
              const data = notification.notification_data as any;
              return {
                articleUrl: data.articleUrl || "",
                articleTitle: data.articleTitle || null,
                articleId: data.articleId || notification.article_id,
                notificationType: data.notificationType || (notification.notification_type as 'rank_drop' | 'rank_rise'),
                rankDropInfo: data.rankDropInfo,
                rankRiseInfo: data.rankRiseInfo,
                analysisResult: data.analysisResult || {
                  prioritizedKeywords: [],
                  competitorResults: [],
                  uniqueCompetitorUrls: [],
                },
              };
            });

          if (items.length === 0) {
            console.warn(`[Test Send Notifications Cron] No valid notification data for user ${user.email}, skipping email notification`);
            continue;
          }

          try {
            const notificationService = new NotificationService();
            await notificationService.sendBulkNotification({
              to: user.email,
              items,
              locale,
            });
            console.log(`[Test Send Notifications Cron] Email notification sent successfully to user ${user.email}`);

            // sent_atを更新
            const sentAt = new Date().toISOString();
            for (const notification of emailNotifications) {
              const { error: updateError } = await supabase
                .from("notifications")
                .update({ sent_at: sentAt })
                .eq("id", notification.id);

              if (updateError) {
                console.error(`[Test Send Notifications Cron] Failed to update sent_at for notification ${notification.id}:`, updateError);
              } else {
                // 記事の通知送信日時を更新
                if (notification.article_id) {
                  const notificationData = notification.notification_data as any;
                  if (notificationData?.articleUrl) {
                    await updateArticleNotificationSent(notificationData.articleUrl, user.id);
                  }
                }
              }
            }
          } catch (emailError: any) {
            console.error(`[Test Send Notifications Cron] Failed to send email notification to user ${user.email}:`, {
              error: emailError.message,
              stack: emailError.stack,
            });
            throw emailError;
          }
        }

        // Slack通知を送信
        if (slackNotifications.length > 0 && notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id) {
          try {
            // notification_dataからBulkNotificationItemに変換
            const items: BulkNotificationItem[] = slackNotifications
              .filter((notification) => notification.notification_data) // notification_dataが存在するもののみ
              .map((notification) => {
                const data = notification.notification_data as any;
                return {
                  articleUrl: data.articleUrl || "",
                  articleTitle: data.articleTitle || null,
                  articleId: data.articleId || notification.article_id,
                  notificationType: data.notificationType || (notification.notification_type as 'rank_drop' | 'rank_rise'),
                  rankDropInfo: data.rankDropInfo,
                  rankRiseInfo: data.rankRiseInfo,
                  analysisResult: data.analysisResult || {
                    prioritizedKeywords: [],
                    competitorResults: [],
                    uniqueCompetitorUrls: [],
                  },
                };
              });

            if (items.length === 0) {
              console.warn(`[Test Send Notifications Cron] No valid notification data for user ${user.email}, skipping Slack notification`);
              continue;
            }

            const slackPayload = formatSlackBulkNotification(
              items.filter((item) => item.rankDropInfo || item.rankRiseInfo).map((item) => {
                const rankInfo = item.rankRiseInfo
                  ? {
                      from: item.rankRiseInfo.baseAveragePosition,
                      to: item.rankRiseInfo.currentAveragePosition,
                      change: item.rankRiseInfo.riseAmount,
                    }
                  : item.rankDropInfo
                  ? {
                      from: item.rankDropInfo.baseAveragePosition,
                      to: item.rankDropInfo.currentAveragePosition,
                      change: item.rankDropInfo.dropAmount,
                    }
                  : null;

                if (!rankInfo) {
                  throw new Error(`Missing rank info for article ${item.articleUrl}`);
                }

                return {
                  url: item.articleUrl,
                  title: item.articleTitle ?? null,
                  articleId: item.articleId,
                  notificationType: item.notificationType,
                  averagePositionChange: rankInfo,
                };
              }),
              locale
            );

            await sendSlackNotificationWithBot(
              notificationSettings.slack_bot_token,
              notificationSettings.slack_channel_id,
              slackPayload
            );
            console.log(`[Test Send Notifications Cron] Slack notification sent via OAuth to user ${user.email}`);

            // sent_atを更新
            const sentAt = new Date().toISOString();
            for (const notification of slackNotifications) {
              const { error: updateError } = await supabase
                .from("notifications")
                .update({ sent_at: sentAt })
                .eq("id", notification.id);

              if (updateError) {
                console.error(`[Test Send Notifications Cron] Failed to update sent_at for notification ${notification.id}:`, updateError);
              } else {
                // 記事の通知送信日時を更新
                if (notification.article_id) {
                  const notificationData = notification.notification_data as any;
                  if (notificationData?.articleUrl) {
                    await updateArticleNotificationSent(notificationData.articleUrl, user.id);
                  }
                }
              }
            }
          } catch (slackError: any) {
            console.error(`[Test Send Notifications Cron] Failed to send Slack notification to user ${user.email}:`, {
              error: slackError.message,
              stack: slackError.stack,
              channelId: notificationSettings.slack_channel_id,
            });
            // Slack通知のエラーはメール通知の送信を妨げない
          }
        }

        sentCount++;
        console.log(`[Test Send Notifications Cron] Notifications sent to user ${user.email} (${notifications.length} notifications)`);
      } catch (error: any) {
        errorCount++;
        console.error(`[Test Send Notifications Cron] Failed to send notifications to user ${user.email}:`, error);
        // エラーが発生しても他のユーザーの通知を続行
        continue;
      }
    }

    const result = {
      message: "Test notification send job completed",
      pendingNotifications: pendingNotifications.length,
      usersNotified: sentCount,
      usersSkipped: skippedCount,
      errors: errorCount,
      skipTimeCheck,
      dryRun,
    };

    console.log("[Test Send Notifications Cron] Notification send job completed:", result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Test Send Notifications Cron] Error in notification send job:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

