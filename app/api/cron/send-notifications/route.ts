import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getUserById } from "@/lib/db/users";
import { getUserAlertSettings } from "@/lib/db/alert-settings";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { isNotificationTime } from "@/lib/timezone-utils";
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

        if (!isNotificationTime(userTimezone, notificationTimeHHMM, 5)) {
          console.log(`[Send Notifications Cron] Skipping notification for user ${user.email}: current time (${userTimezone}) is not notification time (${notificationTimeHHMM})`);
          continue;
        }

        console.log(`[Send Notifications Cron] Notification time check passed for user ${user.email}: timezone=${userTimezone}, notification_time=${notificationTimeHHMM}`);

        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // 通知設定を取得（Slack通知を取得するため）
        const notificationSettings = await getNotificationSettings(user.id);

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

            await sendSlackNotificationWithBot(
              notificationSettings.slack_bot_token,
              notificationSettings.slack_channel_id,
              slackPayload
            );
            console.log(`[Send Notifications Cron] Slack notification sent via OAuth to user ${user.email}`);

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
              channelId: notificationSettings.slack_channel_id,
            });
            // Slack通知のエラーはメール通知の送信を妨げない
          }
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

