import { NextRequest, NextResponse } from "next/server";
import { GSCApiClient } from "@/lib/gsc-api";
import { NotificationChecker } from "@/lib/notification-checker";
import { getMonitoringArticles, updateArticleNotificationSent } from "@/lib/db/articles";
import { getSitesByUserId, updateSiteTokens } from "@/lib/db/sites";
import { getUserById } from "@/lib/db/users";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { createSupabaseClient } from "@/lib/supabase";
import { sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { getUserAlertSettings } from "@/lib/db/alert-settings";

/**
 * Cronジョブ: 順位下落をチェックして通知を送信
 * 実行頻度: 1日1回（UTC 0時、GSC APIのデータは1日単位で更新されるため）
 * 
 * 処理フロー:
 * 1. 監視対象の記事を取得
 * 2. 各記事に対して通知判定を実行
 * 3. 通知が必要な記事をユーザーごとにまとめる
 * 4. まとめ通知を送信
 * 5. 通知履歴をDBに保存
 * 
 * 注意: タイムゾーンチェックは省略（GSC APIのデータ更新が1日単位のため、
 * 通知時刻のチェックは実質的に意味がない。ユーザーは設定した時刻に近い時間に
 * 通知を受信するが、データの更新タイミングに依存する）
 */
export async function GET(request: NextRequest) {
  // Cronジョブの認証（Vercel Cronからのリクエストか確認）
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Starting rank check job...");

    // 監視対象の記事を取得
    const articles = await getMonitoringArticles();
    console.log(`[Cron] Found ${articles.length} monitoring articles`);

    if (articles.length === 0) {
      return NextResponse.json({ message: "No articles to monitor" });
    }

    // ユーザーごとに通知が必要な記事をまとめる
    const notificationsByUser: Map<
      string,
      {
        user: { id: string; email: string; name: string | null; locale: string | null };
        items: BulkNotificationItem[];
      }
    > = new Map();

    // ユーザーごとにGSCクライアントを管理
    const userGscClients: Map<string, GSCApiClient> = new Map();

    // 各記事に対して通知判定を実行
    for (const article of articles) {
      try {
        // ユーザー情報を取得
        const user = await getUserById(article.user_id);
        if (!user || !user.email) {
          console.warn(`[Cron] User not found or email missing for article ${article.id}`);
          continue;
        }

        // サイト情報を取得
        if (!article.site_id) {
          console.warn(`[Cron] Site ID missing for article ${article.id}`);
          continue;
        }

        const sites = await getSitesByUserId(article.user_id);
        const site = sites.find((s) => s.id === article.site_id);
        if (!site || !site.is_active) {
          console.warn(`[Cron] Site not found or inactive for article ${article.id}`);
          continue;
        }

        // GSCアクセストークンを取得（サイト情報から）
        if (!site.gsc_access_token) {
          console.warn(`[Cron] GSC access token missing for site ${site.id}`);
          continue;
        }

        // トークンの有効期限をチェックし、必要に応じてリフレッシュ
        const tokenExpiresAt = site.gsc_token_expires_at
          ? new Date(site.gsc_token_expires_at).getTime()
          : null;
        const now = Date.now();
        let accessToken = site.gsc_access_token;
        let refreshToken = site.gsc_refresh_token;

        // トークンが期限切れまたは期限切れ間近（10分前）の場合、リフレッシュを試みる
        if (tokenExpiresAt && now >= tokenExpiresAt - 10 * 60 * 1000) {
          if (!refreshToken) {
            console.warn(
              `[Cron] GSC access token expired for site ${site.id}, but no refresh token available. Skipping.`
            );
            continue;
          }

          try {
            console.log(`[Cron] Refreshing GSC access token for site ${site.id}...`);
            const gscClient = new GSCApiClient(accessToken);
            const refreshed = await gscClient.refreshAccessToken(refreshToken);

            // トークンをDBに更新
            await updateSiteTokens(
              site.id,
              refreshed.accessToken,
              refreshed.refreshToken || refreshToken, // 新しいリフレッシュトークンがあれば使用、なければ既存のものを保持
              refreshed.expiresAt
            );

            accessToken = refreshed.accessToken;
            if (refreshed.refreshToken) {
              refreshToken = refreshed.refreshToken;
            }

            console.log(`[Cron] Successfully refreshed GSC access token for site ${site.id}`);
          } catch (error: any) {
            console.error(
              `[Cron] Failed to refresh GSC access token for site ${site.id}:`,
              error.message
            );
            continue;
          }
        }

        // ユーザーごとのGSCクライアントを取得または作成
        let gscClient = userGscClients.get(article.user_id);
        if (!gscClient) {
          gscClient = new GSCApiClient(accessToken);
          userGscClients.set(article.user_id, gscClient);
        }

        // 通知判定を実行
        // 注意: GSC APIのデータは1日単位で更新されるため、タイムゾーンチェックは省略
        // 通知は1日1回実行時に送信される（ユーザーが設定した時刻とは異なる可能性がある）
        const checker = new NotificationChecker(gscClient);
        const checkResult = await checker.checkNotificationNeeded(
          article.user_id,
          article.id,
          site.site_url,
          article.url
        );

        if (!checkResult.shouldNotify) {
          console.log(
            `[Cron] Notification not needed for article ${article.id}: ${checkResult.reason.key}`
          );
          continue;
        }

        // 通知が必要な場合、ユーザーごとにまとめる
        if (!notificationsByUser.has(article.user_id)) {
          notificationsByUser.set(article.user_id, {
            user: user, // 完全なUserオブジェクトを保存（localeを含む）
            items: [],
          });
        }

        const userNotifications = notificationsByUser.get(article.user_id)!;

        // 通知タイプに応じて情報を設定
        if (checkResult.notificationType === 'rank_rise' && checkResult.rankRiseResult) {
          // 順位上昇の通知
          userNotifications.items.push({
            articleUrl: article.url,
            articleTitle: article.title,
            articleId: article.id,
            notificationType: 'rank_rise',
            rankRiseInfo: {
              baseAveragePosition: checkResult.rankRiseResult.baseAveragePosition,
              currentAveragePosition: checkResult.rankRiseResult.currentAveragePosition,
              riseAmount: checkResult.rankRiseResult.riseAmount,
              risenKeywords: checkResult.rankRiseResult.risenKeywords.map((kw) => ({
                keyword: kw.keyword,
                position: kw.position,
                impressions: kw.impressions,
              })),
            },
          });
        } else {
          // 順位下落の通知
          userNotifications.items.push({
            articleUrl: article.url,
            articleTitle: article.title,
            articleId: article.id,
            notificationType: 'rank_drop',
            analysisResult: {
              prioritizedKeywords: checkResult.rankDropResult.droppedKeywords.map((kw) => ({
                keyword: kw.keyword,
                priority: kw.impressions,
                impressions: kw.impressions,
                clicks: kw.clicks,
                position: kw.position,
              })),
              competitorResults: [],
              uniqueCompetitorUrls: [],
            },
            rankDropInfo: {
              baseAveragePosition: checkResult.rankDropResult.baseAveragePosition,
              currentAveragePosition: checkResult.rankDropResult.currentAveragePosition,
              dropAmount: checkResult.rankDropResult.dropAmount,
              droppedKeywords: checkResult.rankDropResult.droppedKeywords.map((kw) => ({
                keyword: kw.keyword,
                position: kw.position,
                impressions: kw.impressions,
              })),
            },
          });
        }
      } catch (error: any) {
        console.error(`[Cron] Error processing article ${article.id}:`, error);
        // エラーが発生しても他の記事の処理を続行
        continue;
      }
    }

    // 各ユーザーに対してまとめ通知を送信
    const notificationService = new NotificationService();
    const supabase = createSupabaseClient();
    let sentCount = 0;
    let errorCount = 0;

    console.log(`[Cron] Total users with notifications: ${notificationsByUser.size}`);
    for (const [userId, { user, items }] of notificationsByUser.entries()) {
      console.log(`[Cron] User ${user.email}: ${items.length} notification items`);
    }

    for (const [userId, { user, items }] of notificationsByUser.entries()) {
      if (items.length === 0) {
        console.log(`[Cron] Skipping user ${user.email}: no notification items`);
        continue;
      }

      try {
        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // ユーザーのアラート設定を取得（通知頻度を確認するため）
        const userAlertSettings = await getUserAlertSettings(user.id);
        const notificationFrequency = userAlertSettings.notification_frequency || 'daily';

        // 通知頻度に応じて通知を送信するかどうかを判定
        if (notificationFrequency === 'none') {
          console.log(`[Cron] Skipping notification for user ${user.email}: notification_frequency is 'none'`);
          continue;
        }

        if (notificationFrequency === 'weekly') {
          // 週1回通知：月曜日に送信
          const now = new Date();
          const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          if (dayOfWeek !== 1) {
            console.log(`[Cron] Skipping notification for user ${user.email}: notification_frequency is 'weekly' but today is not Monday (dayOfWeek: ${dayOfWeek})`);
            continue;
          }
        }


        // 通知設定を取得（Slack通知を取得するため）
        const notificationSettings = await getNotificationSettings(user.id);
        console.log(`[Cron] Notification settings for user ${user.email}:`, {
          hasSlackBotToken: !!notificationSettings?.slack_bot_token,
          hasSlackChannelId: !!notificationSettings?.slack_channel_id,
          slackChannelId: notificationSettings?.slack_channel_id,
          slackNotificationType: notificationSettings?.slack_notification_type,
          slackTeamId: notificationSettings?.slack_team_id,
        });

        // メール通知を送信
        console.log(`[Cron] Attempting to send email notification to user ${user.email}...`, {
          itemsCount: items.length,
          locale,
        });
        try {
          await notificationService.sendBulkNotification({
            to: user.email,
            items,
            locale,
          });
          console.log(`[Cron] Email notification sent successfully to user ${user.email}`);
        } catch (emailError: any) {
          console.error(`[Cron] Failed to send email notification to user ${user.email}:`, {
            error: emailError.message,
            stack: emailError.stack,
          });
          throw emailError; // メール送信エラーは通知処理全体を失敗させる
        }

        // Slack通知を送信（OAuth方式のみ）
        console.log(`[Cron] Checking Slack notification conditions for user ${user.email}:`, {
          hasSlackBotToken: !!notificationSettings?.slack_bot_token,
          hasSlackChannelId: !!notificationSettings?.slack_channel_id,
          slackChannelId: notificationSettings?.slack_channel_id,
          itemsCount: items.length,
          itemsWithRankInfo: items.filter((item) => item.rankDropInfo || item.rankRiseInfo).length,
        });

        if (!notificationSettings?.slack_bot_token) {
          console.log(`[Cron] Slack notification skipped for user ${user.email}: slack_bot_token is missing`);
        } else if (!notificationSettings?.slack_channel_id) {
          console.log(`[Cron] Slack notification skipped for user ${user.email}: slack_channel_id is missing`);
        }

        if (notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id) {
          try {
            const slackPayload = formatSlackBulkNotification(
              items
                .filter((item) => item.rankDropInfo || item.rankRiseInfo) // rankDropInfoまたはrankRiseInfoが存在するもののみ
                .map((item) => {
                  // 順位上昇の場合はrankRiseInfoを使用、順位下落の場合はrankDropInfoを使用
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
                    averagePositionChange: rankInfo,
                  };
                }),
              locale
            );

            console.log(`[Cron] Sending Slack notification via OAuth to user ${user.email}...`, {
              hasBotToken: !!notificationSettings.slack_bot_token,
              channelId: notificationSettings.slack_channel_id,
              notificationType: notificationSettings.slack_notification_type,
            });

            await sendSlackNotificationWithBot(
              notificationSettings.slack_bot_token,
              notificationSettings.slack_channel_id,
              slackPayload
            );
            console.log(`[Cron] Slack notification sent via OAuth to user ${user.email}`);
          } catch (slackError: any) {
            console.error(`[Cron] Failed to send Slack notification to user ${user.email}:`, {
              error: slackError.message,
              stack: slackError.stack,
              channelId: notificationSettings.slack_channel_id,
            });
            // Slack通知のエラーはメール通知の送信を妨げない
          }
        }

        // 通知履歴をDBに保存
        for (const item of items) {
          // 記事の通知送信日時を更新
          const article = articles.find((a) => a.url === item.articleUrl);
          if (article) {
            await updateArticleNotificationSent(article.url, user.id);
          }

          // notificationsテーブルにレコードを作成（メール通知）
          const notificationType = item.notificationType || 'rank_drop';
          const isRise = notificationType === 'rank_rise';
          const subject = items.length === 1
            ? (isRise ? "【ReRank AI】順位上昇を検知しました" : "【ReRank AI】順位下落を検知しました")
            : (isRise ? `【ReRank AI】順位上昇を検知しました（${items.length}件の記事）` : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`);
          const summary = isRise
            ? `順位上昇が検知されました（${items.length}件の記事）`
            : `順位下落が検知されました（${items.length}件の記事）`;

          const { error: emailNotificationError } = await supabase.from("notifications").insert({
            user_id: user.id,
            article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
            notification_type: notificationType,
            channel: "email",
            recipient: user.email,
            subject,
            summary,
            sent_at: new Date().toISOString(),
          });

          if (emailNotificationError) {
            console.error(
              `[Cron] Failed to save email notification for article ${item.articleUrl}:`,
              emailNotificationError
            );
          }

          // Slack通知も送信された場合、Slack通知のレコードも作成
          if (notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id) {
            const slackNotificationType = item.notificationType || 'rank_drop';
            const isSlackRise = slackNotificationType === 'rank_rise';
            const slackSubject = items.length === 1
              ? (isSlackRise ? "【ReRank AI】順位上昇を検知しました" : "【ReRank AI】順位下落を検知しました")
              : (isSlackRise ? `【ReRank AI】順位上昇を検知しました（${items.length}件の記事）` : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`);
            const slackSummary = isSlackRise
              ? `順位上昇が検知されました（${items.length}件の記事）`
              : `順位下落が検知されました（${items.length}件の記事）`;

            const { error: slackNotificationError } = await supabase.from("notifications").insert({
              user_id: user.id,
              article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
              notification_type: slackNotificationType,
              channel: "slack",
              recipient: notificationSettings.slack_channel_id, // チャンネルIDまたはUser IDを保存
              subject: slackSubject,
              summary: slackSummary,
              sent_at: new Date().toISOString(),
            });

            if (slackNotificationError) {
              console.error(
                `[Cron] Failed to save Slack notification for article ${item.articleUrl}:`,
                slackNotificationError
              );
            }
          }
        }

        sentCount++;
        console.log(`[Cron] Notification sent to user ${user.email} (${items.length} articles)`);
      } catch (error: any) {
        errorCount++;
        console.error(`[Cron] Failed to send notification to user ${user.email}:`, error);
        // エラーが発生しても他のユーザーの通知を続行
        continue;
      }
    }

    const result = {
      message: "Rank check completed",
      articlesChecked: articles.length,
      usersNotified: sentCount,
      errors: errorCount,
      totalNotifications: Array.from(notificationsByUser.values()).reduce(
        (sum, { items }) => sum + items.length,
        0
      ),
    };

    console.log("[Cron] Rank check job completed:", result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Cron] Error in rank check job:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

