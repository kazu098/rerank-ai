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
 * Cronジョブ: 通知キューから通知を送信
 * 実行頻度: 1時間ごと（0 * * * *）
 * 
 * 処理フロー:
 * 1. sent_at IS NULLの通知を取得
 * 2. ユーザーごとにまとめる
 * 3. 各ユーザーの通知時刻をチェック
 * 4. 通知時刻に達している場合は送信してsent_atを更新
 */
export async function GET(request: NextRequest) {
  // Cronジョブの認証（Vercel Cronからのリクエストか確認）
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Send Notifications Cron] Starting notification send job...");

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
      console.log("[Send Notifications Cron] No pending notifications");
      return NextResponse.json({ message: "No pending notifications", sentCount: 0 });
    }

    console.log(`[Send Notifications Cron] Found ${pendingNotifications.length} pending notifications`);

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
          console.warn(`[Send Notifications Cron] User not found or email missing for notification ${notification.id}`);
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
    let errorCount = 0;

    // 各ユーザーに対して通知を送信
    for (const [userId, { user, notifications }] of notificationsByUser.entries()) {
      try {
        // ユーザーのアラート設定を取得（通知時刻を確認するため）
        const userAlertSettings = await getUserAlertSettings(user.id);
        const notificationFrequency = userAlertSettings.notification_frequency || 'daily';

        // 通知頻度に応じて通知を送信するかどうかを判定
        if (notificationFrequency === 'none') {
          console.log(`[Send Notifications Cron] Skipping notification for user ${user.email}: notification_frequency is 'none'`);
          continue;
        }

        if (notificationFrequency === 'weekly') {
          // 週1回通知：月曜日に送信
          const now = new Date();
          const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          if (dayOfWeek !== 1) {
            console.log(`[Send Notifications Cron] Skipping notification for user ${user.email}: notification_frequency is 'weekly' but today is not Monday (dayOfWeek: ${dayOfWeek})`);
            continue;
          }
        }

        // 通知時刻をチェック
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

        console.log(`[Send Notifications Cron] Notification time check for user ${user.email}:`, {
          timezone: userTimezone,
          notificationTime: notificationTimeHHMM,
          currentTime: currentTimeInTimezone,
          isTimeMatch,
          toleranceMinutes: 20,
        });

        if (!isTimeMatch) {
          console.log(`[Send Notifications Cron] Skipping notification for user ${user.email}: current time (${currentTimeInTimezone} in ${userTimezone}) is not notification time (${notificationTimeHHMM})`);
          continue;
        }

        console.log(`[Send Notifications Cron] Notification time check passed for user ${user.email}: timezone=${userTimezone}, notification_time=${notificationTimeHHMM}`);

        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // 通知設定を取得（Slack通知を取得するため）
        let notificationSettings = await getNotificationSettings(user.id);
        
        // Slack通知を送信する場合は、常にslack_integrationsテーブルから最新の情報を取得
        // （チャンネル切り替えが反映されていない問題を解決するため）
        const slackIntegration = await getSlackIntegrationByUserId(user.id);
        if (slackIntegration) {
          // NotificationSettings形式に変換（最新のslack_integrationsの情報を使用）
          notificationSettings = {
            id: notificationSettings?.id || '',
            user_id: user.id,
            article_id: notificationSettings?.article_id || null,
            notification_type: notificationSettings?.notification_type || 'rank_drop',
            channel: notificationSettings?.channel || 'slack',
            recipient: slackIntegration.slack_notification_type === 'dm' 
              ? (slackIntegration.slack_user_id || '')
              : (slackIntegration.slack_channel_id || ''),
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
          console.log(`[Send Notifications Cron] Using latest Slack integration from slack_integrations table for user ${user.email}:`, {
            notificationType: slackIntegration.slack_notification_type,
            channelId: slackIntegration.slack_channel_id,
            userId: slackIntegration.slack_user_id,
          });
        } else if (!notificationSettings || !notificationSettings.slack_bot_token) {
          if (!notificationSettings) {
            console.log(`[Send Notifications Cron] No notification_settings found for user ${user.email}, and no Slack integration found`);
          } else {
            console.log(`[Send Notifications Cron] notification_settings found but slack_bot_token is null for user ${user.email}, and no Slack integration found`);
          }
        }

        // 通知をメール通知とSlack通知に分類
        const emailNotifications = notifications.filter((n) => n.channel === "email");
        const slackNotifications = notifications.filter((n) => n.channel === "slack");

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
            console.warn(`[Send Notifications Cron] No valid notification data for user ${user.email}, skipping email notification`);
            continue;
          }

          try {
            const notificationService = new NotificationService();
            await notificationService.sendBulkNotification({
              to: user.email,
              items,
              locale,
            });
            console.log(`[Send Notifications Cron] Email notification sent successfully to user ${user.email}`);

            // sent_atを更新
            const sentAt = new Date().toISOString();
            for (const notification of emailNotifications) {
              const { error: updateError } = await supabase
                .from("notifications")
                .update({ sent_at: sentAt })
                .eq("id", notification.id);

              if (updateError) {
                console.error(`[Send Notifications Cron] Failed to update sent_at for notification ${notification.id}:`, updateError);
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
            console.error(`[Send Notifications Cron] Failed to send email notification to user ${user.email}:`, {
              error: emailError.message,
              stack: emailError.stack,
            });
            throw emailError;
          }
        }

        // Slack通知を送信
        // DMの場合はslack_user_id、チャンネルの場合はslack_channel_idが必要
        const hasSlackBotToken = notificationSettings?.slack_bot_token;
        const hasSlackRecipient = notificationSettings?.slack_notification_type === 'dm'
          ? !!notificationSettings?.slack_user_id
          : !!notificationSettings?.slack_channel_id;
        
        if (slackNotifications.length > 0 && hasSlackBotToken && hasSlackRecipient) {
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
              console.warn(`[Send Notifications Cron] No valid notification data for user ${user.email}, skipping Slack notification`);
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

            // DMの場合はslack_user_id、チャンネルの場合はslack_channel_idを使用
            const recipientId = notificationSettings.slack_notification_type === 'dm'
              ? notificationSettings.slack_user_id!
              : notificationSettings.slack_channel_id!;

            await sendSlackNotificationWithBot(
              notificationSettings.slack_bot_token!,
              recipientId,
              slackPayload
            );
            console.log(`[Send Notifications Cron] Slack notification sent via OAuth to user ${user.email}:`, {
              notificationType: notificationSettings.slack_notification_type,
              recipientId,
            });

            // sent_atを更新
            const sentAt = new Date().toISOString();
            for (const notification of slackNotifications) {
              const { error: updateError } = await supabase
                .from("notifications")
                .update({ sent_at: sentAt })
                .eq("id", notification.id);

              if (updateError) {
                console.error(`[Send Notifications Cron] Failed to update sent_at for notification ${notification.id}:`, updateError);
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
            console.error(`[Send Notifications Cron] Failed to send Slack notification to user ${user.email}:`, {
              error: slackError.message,
              stack: slackError.stack,
              notificationType: notificationSettings?.slack_notification_type,
              channelId: notificationSettings?.slack_channel_id,
              userId: notificationSettings?.slack_user_id,
            });
            // Slack通知のエラーはメール通知の送信を妨げない
          }
        } else if (slackNotifications.length > 0) {
          console.warn(`[Send Notifications Cron] Skipping Slack notification for user ${user.email}:`, {
            hasSlackBotToken,
            hasSlackRecipient,
            notificationType: notificationSettings?.slack_notification_type,
            hasChannelId: !!notificationSettings?.slack_channel_id,
            hasUserId: !!notificationSettings?.slack_user_id,
          });
        } else if (slackNotifications.length > 0) {
          console.warn(`[Send Notifications Cron] Skipping Slack notification for user ${user.email}:`, {
            hasSlackBotToken,
            hasSlackRecipient,
            notificationType: notificationSettings?.slack_notification_type,
            hasChannelId: !!notificationSettings?.slack_channel_id,
            hasUserId: !!notificationSettings?.slack_user_id,
          });
        }

        sentCount++;
        console.log(`[Send Notifications Cron] Notifications sent to user ${user.email} (${notifications.length} notifications)`);
      } catch (error: any) {
        errorCount++;
        console.error(`[Send Notifications Cron] Failed to send notifications to user ${user.email}:`, error);
        // エラーが発生しても他のユーザーの通知を続行
        continue;
      }
    }

    const result = {
      message: "Notification send job completed",
      pendingNotifications: pendingNotifications.length,
      usersNotified: sentCount,
      errors: errorCount,
    };

    console.log("[Send Notifications Cron] Notification send job completed:", result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Send Notifications Cron] Error in notification send job:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

