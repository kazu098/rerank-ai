import { NextRequest, NextResponse } from "next/server";
import { GSCApiClient } from "@/lib/gsc-api";
import { NotificationChecker } from "@/lib/notification-checker";
import { getMonitoringArticles, updateArticleNotificationSent } from "@/lib/db/articles";
import { getSitesByUserId, updateSiteTokens } from "@/lib/db/sites";
import { getUserById } from "@/lib/db/users";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { createSupabaseClient } from "@/lib/supabase";
import { sendSlackNotification, sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { getNotificationSettings } from "@/lib/db/notification-settings";

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

        // 分析結果を取得（簡易版：通知判定で取得した情報を使用）
        // 実際の分析結果は必要に応じて取得
        userNotifications.items.push({
          articleUrl: article.url,
          articleTitle: article.title,
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

    for (const [userId, { user, items }] of notificationsByUser.entries()) {
      if (items.length === 0) {
        continue;
      }

      try {
        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // 通知設定を取得（Slack Webhook URLを取得するため）
        const notificationSettings = await getNotificationSettings(user.id);

        // メール通知を送信
        await notificationService.sendBulkNotification({
          to: user.email,
          items,
          locale,
        });

        // Slack通知を送信
        if (notificationSettings?.slack_webhook_url || notificationSettings?.slack_bot_token) {
          try {
            const slackPayload = formatSlackBulkNotification(
              items.map((item) => ({
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

            // OAuth方式（Bot Token）を使用
            if (notificationSettings.slack_bot_token && notificationSettings.slack_channel_id) {
              await sendSlackNotificationWithBot(
                notificationSettings.slack_bot_token,
                notificationSettings.slack_channel_id,
                slackPayload
              );
              console.log(`[Cron] Slack notification sent via OAuth to user ${user.email}`);
            }
            // Webhook方式（旧方式）を使用
            else if (notificationSettings.slack_webhook_url) {
              await sendSlackNotification(notificationSettings.slack_webhook_url, slackPayload);
              console.log(`[Cron] Slack notification sent via Webhook to user ${user.email}`);
            }
          } catch (slackError: any) {
            console.error(`[Cron] Failed to send Slack notification to user ${user.email}:`, slackError);
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
          const { error: emailNotificationError } = await supabase.from("notifications").insert({
            user_id: user.id,
            article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
            notification_type: "rank_drop",
            channel: "email",
            recipient: user.email,
            subject: items.length === 1
              ? "【ReRank AI】順位下落を検知しました"
              : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`,
            summary: `順位下落が検知されました（${items.length}件の記事）`,
            sent_at: new Date().toISOString(),
          });

          if (emailNotificationError) {
            console.error(
              `[Cron] Failed to save email notification for article ${item.articleUrl}:`,
              emailNotificationError
            );
          }

          // Slack通知も送信された場合、Slack通知のレコードも作成
          if (notificationSettings?.slack_webhook_url) {
            const { error: slackNotificationError } = await supabase.from("notifications").insert({
              user_id: user.id,
              article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
              notification_type: "rank_drop",
              channel: "slack",
              recipient: notificationSettings.slack_webhook_url, // Webhook URLを保存（実際のチャンネル名は取得できない）
              subject: items.length === 1
                ? "【ReRank AI】順位下落を検知しました"
                : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`,
              summary: `順位下落が検知されました（${items.length}件の記事）`,
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

