import { NextRequest, NextResponse } from "next/server";
import { GSCApiClient } from "@/lib/gsc-api";
import { NotificationChecker } from "@/lib/notification-checker";
import { getMonitoringArticles, updateArticleNotificationSent, updateArticleAnalysis } from "@/lib/db/articles";
import { getSitesByUserId, updateSiteTokens } from "@/lib/db/sites";
import { getUserById } from "@/lib/db/users";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { createSupabaseClient } from "@/lib/supabase";
import { sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { getUserAlertSettings } from "@/lib/db/alert-settings";

/**
 * テスト用: 順位下落チェックを手動実行
 * 
 * 認証: 環境変数 TEST_SECRET、CRON_TEST_SECRET または CRON_SECRET で認証
 * 使用方法:
 *   curl -X GET "http://localhost:3000/api/cron/check-rank/test?dryRun=true" \
 *        -H "Authorization: Bearer YOUR_TEST_SECRET"
 *   または
 *   curl -X POST "http://localhost:3000/api/cron/check-rank/test?dryRun=true" \
 *        -H "Authorization: Bearer YOUR_TEST_SECRET"
 * 
 * クエリパラメータ:
 *   - dryRun: true の場合、通知は送信せずログのみ出力
 *   - articleId: 特定の記事IDのみをチェック（オプション）
 */
async function handleRequest(request: NextRequest) {
  // テスト用の認証（環境変数 TEST_SECRET、CRON_TEST_SECRET または CRON_SECRET を使用）
  const authHeader = request.headers.get("authorization");
  const testSecret = process.env.TEST_SECRET || process.env.CRON_TEST_SECRET || process.env.CRON_SECRET;
  
  if (!testSecret || authHeader !== `Bearer ${testSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized. Set TEST_SECRET, CRON_TEST_SECRET or CRON_SECRET environment variable." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";
  const articleId = searchParams.get("articleId");

  try {
    console.log("[Test Cron] Starting rank check job...", { dryRun, articleId });

    // 監視対象の記事を取得
    let articles = await getMonitoringArticles();
    console.log(`[Test Cron] Found ${articles.length} monitoring articles`);

    // 特定の記事IDが指定されている場合はフィルタ
    if (articleId) {
      articles = articles.filter((a) => a.id === articleId);
      console.log(`[Test Cron] Filtered to ${articles.length} article(s) for articleId: ${articleId}`);
    }

    if (articles.length === 0) {
      return NextResponse.json({ 
        message: "No articles to monitor",
        articlesChecked: 0,
        usersNotified: 0,
        errors: 0,
        totalNotifications: 0,
      });
    }

    // 各記事の詳細情報をログ出力
    console.log("[Test Cron] Articles to check:", articles.map(a => ({
      id: a.id,
      url: a.url,
      title: a.title,
      userId: a.user_id,
      siteId: a.site_id,
      isMonitoring: a.is_monitoring,
      lastNotificationSentAt: a.last_notification_sent_at,
      isFixed: a.is_fixed,
      fixedAt: a.fixed_at,
    })));

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
    const checkResults: Array<{
      articleId: string;
      articleUrl: string;
      shouldNotify: boolean;
      reason: string;
      details: any;
    }> = [];

    for (const article of articles) {
      try {
        console.log(`[Test Cron] Processing article ${article.id} (${article.url})...`);

        // ユーザー情報を取得
        const user = await getUserById(article.user_id);
        if (!user || !user.email) {
          console.warn(`[Test Cron] User not found or email missing for article ${article.id}`);
          checkResults.push({
            articleId: article.id,
            articleUrl: article.url,
            shouldNotify: false,
            reason: "User not found or email missing",
            details: { userId: article.user_id },
          });
          continue;
        }

        console.log(`[Test Cron] User info:`, {
          userId: user.id,
          email: user.email,
          locale: user.locale,
          timezone: user.timezone,
        });

        // サイト情報を取得
        if (!article.site_id) {
          console.warn(`[Test Cron] Site ID missing for article ${article.id}`);
          checkResults.push({
            articleId: article.id,
            articleUrl: article.url,
            shouldNotify: false,
            reason: "Site ID missing",
            details: {},
          });
          continue;
        }

        const sites = await getSitesByUserId(article.user_id);
        const site = sites.find((s) => s.id === article.site_id);
        if (!site || !site.is_active) {
          console.warn(`[Test Cron] Site not found or inactive for article ${article.id}`);
          checkResults.push({
            articleId: article.id,
            articleUrl: article.url,
            shouldNotify: false,
            reason: "Site not found or inactive",
            details: { siteId: article.site_id, isActive: site?.is_active },
          });
          continue;
        }

        console.log(`[Test Cron] Site info:`, {
          siteId: site.id,
          siteUrl: site.site_url,
          isActive: site.is_active,
          hasAccessToken: !!site.gsc_access_token,
          tokenExpiresAt: site.gsc_token_expires_at,
        });

        // GSCアクセストークンを取得（サイト情報から）
        if (!site.gsc_access_token) {
          console.warn(`[Test Cron] GSC access token missing for site ${site.id}`);
          checkResults.push({
            articleId: article.id,
            articleUrl: article.url,
            shouldNotify: false,
            reason: "GSC access token missing",
            details: { siteId: site.id },
          });
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
              `[Test Cron] GSC access token expired for site ${site.id}, but no refresh token available. Skipping.`
            );
            checkResults.push({
              articleId: article.id,
              articleUrl: article.url,
              shouldNotify: false,
              reason: "GSC token expired and no refresh token",
              details: { siteId: site.id, tokenExpiresAt: site.gsc_token_expires_at },
            });
            continue;
          }

          try {
            console.log(`[Test Cron] Refreshing GSC access token for site ${site.id}...`);
            const gscClient = new GSCApiClient(accessToken);
            const refreshed = await gscClient.refreshAccessToken(refreshToken);

            // トークンをDBに更新
            await updateSiteTokens(
              site.id,
              refreshed.accessToken,
              refreshed.refreshToken || refreshToken,
              refreshed.expiresAt
            );

            accessToken = refreshed.accessToken;
            if (refreshed.refreshToken) {
              refreshToken = refreshed.refreshToken;
            }

            console.log(`[Test Cron] Successfully refreshed GSC access token for site ${site.id}`);
          } catch (error: any) {
            console.error(
              `[Test Cron] Failed to refresh GSC access token for site ${site.id}:`,
              error.message
            );
            checkResults.push({
              articleId: article.id,
              articleUrl: article.url,
              shouldNotify: false,
              reason: "Failed to refresh GSC token",
              details: { error: error.message },
            });
            continue;
          }
        }

        // ユーザーごとのGSCクライアントを取得または作成
        let gscClient = userGscClients.get(article.user_id);
        if (!gscClient) {
          gscClient = new GSCApiClient(accessToken);
          userGscClients.set(article.user_id, gscClient);
        }

        // ユーザーのアラート設定を取得（ログ出力用）
        const userAlertSettings = await getUserAlertSettings(article.user_id);
        console.log(`[Test Cron] User alert settings:`, {
          userId: article.user_id,
          notificationFrequency: userAlertSettings.notification_frequency,
          positionDropThreshold: userAlertSettings.position_drop_threshold,
          keywordDropThreshold: userAlertSettings.keyword_drop_threshold,
          comparisonDays: userAlertSettings.comparison_days,
          consecutiveDropDays: userAlertSettings.consecutive_drop_days,
          minImpressions: userAlertSettings.min_impressions,
          notificationCooldownDays: userAlertSettings.notification_cooldown_days,
        });

        // 通知判定を実行
        console.log(`[Test Cron] Checking notification needed for article ${article.id}...`);
        const checker = new NotificationChecker(gscClient);
        const checkResult = await checker.checkNotificationNeeded(
          article.user_id,
          article.id,
          site.site_url,
          article.url
        );

        console.log(`[Test Cron] Notification check result for article ${article.id}:`, {
          shouldNotify: checkResult.shouldNotify,
          reason: checkResult.reason,
          notificationType: checkResult.notificationType,
          rankDropResult: checkResult.rankDropResult ? {
            hasDrop: checkResult.rankDropResult.hasDrop,
            dropAmount: checkResult.rankDropResult.dropAmount,
            baseAveragePosition: checkResult.rankDropResult.baseAveragePosition,
            currentAveragePosition: checkResult.rankDropResult.currentAveragePosition,
            droppedKeywordsCount: checkResult.rankDropResult.droppedKeywords?.length ?? 0,
            droppedKeywords: checkResult.rankDropResult.droppedKeywords?.slice(0, 5).map(kw => ({
              keyword: kw.keyword,
              position: kw.position,
              impressions: kw.impressions,
            })) ?? [],
          } : null,
          rankRiseResult: checkResult.rankRiseResult ? {
            riseAmount: checkResult.rankRiseResult.riseAmount,
            baseAveragePosition: checkResult.rankRiseResult.baseAveragePosition,
            currentAveragePosition: checkResult.rankRiseResult.currentAveragePosition,
            risenKeywordsCount: checkResult.rankRiseResult.risenKeywords?.length ?? 0,
          } : null,
          settings: checkResult.settings,
        });

        checkResults.push({
          articleId: article.id,
          articleUrl: article.url,
          shouldNotify: checkResult.shouldNotify,
          reason: checkResult.reason.key,
          details: {
            reasonParams: checkResult.reason.params,
            rankDropResult: checkResult.rankDropResult ? {
              hasDrop: checkResult.rankDropResult.hasDrop,
              dropAmount: checkResult.rankDropResult.dropAmount,
              baseAveragePosition: checkResult.rankDropResult.baseAveragePosition,
              currentAveragePosition: checkResult.rankDropResult.currentAveragePosition,
              droppedKeywordsCount: checkResult.rankDropResult.droppedKeywords?.length ?? 0,
            } : null,
            rankRiseResult: checkResult.rankRiseResult ? {
              riseAmount: checkResult.rankRiseResult.riseAmount,
              baseAveragePosition: checkResult.rankRiseResult.baseAveragePosition,
              currentAveragePosition: checkResult.rankRiseResult.currentAveragePosition,
              risenKeywordsCount: checkResult.rankRiseResult.risenKeywords?.length ?? 0,
            } : null,
            settings: checkResult.settings,
          },
        });

        // 順位データをDBに保存（通知が必要かどうかに関わらず更新）
        try {
          // rankDropResultまたはrankRiseResultから現在の順位を取得
          const currentPosition = checkResult.rankDropResult?.currentAveragePosition 
            ?? checkResult.rankRiseResult?.currentAveragePosition;
          const previousPosition = article.current_average_position;
          
          if (currentPosition !== undefined) {
            await updateArticleAnalysis(
              article.id,
              currentPosition,
              previousPosition !== null ? previousPosition : undefined
            );
            
            console.log(`[Test Cron] Updated article analysis data for article ${article.id}:`, {
              currentPosition,
              previousPosition,
            });
          }
        } catch (updateError: any) {
          console.error(`[Test Cron] Failed to update article analysis for article ${article.id}:`, updateError);
          // エラーが発生しても処理を続行
        }

        if (!checkResult.shouldNotify) {
          console.log(
            `[Test Cron] Notification not needed for article ${article.id}: ${checkResult.reason.key}`,
            checkResult.reason.params
          );
          continue;
        }

        // 通知が必要な場合、ユーザーごとにまとめる
        if (!notificationsByUser.has(article.user_id)) {
          notificationsByUser.set(article.user_id, {
            user: user,
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
              risenKeywords: (checkResult.rankRiseResult.risenKeywords ?? []).map((kw) => ({
                keyword: kw.keyword,
                position: kw.position,
                impressions: kw.impressions,
              })),
            },
          });
        } else if (checkResult.rankDropResult) {
          // 順位下落の通知
          userNotifications.items.push({
            articleUrl: article.url,
            articleTitle: article.title,
            articleId: article.id,
            notificationType: 'rank_drop',
            analysisResult: {
              prioritizedKeywords: (checkResult.rankDropResult.droppedKeywords ?? []).map((kw) => ({
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
              droppedKeywords: (checkResult.rankDropResult.droppedKeywords ?? []).map((kw) => ({
                keyword: kw.keyword,
                position: kw.position,
                impressions: kw.impressions,
              })),
            },
          });
        } else {
          // rankDropResultもrankRiseResultも存在しない場合（通常は発生しないはず）
          console.warn(`[Test Cron] No rank info available for article ${article.id}, skipping notification item`);
          continue;
        }

        console.log(`[Test Cron] Article ${article.id} added to notification queue`);
      } catch (error: any) {
        console.error(`[Test Cron] Error processing article ${article.id}:`, error);
        checkResults.push({
          articleId: article.id,
          articleUrl: article.url,
          shouldNotify: false,
          reason: "Error during processing",
          details: { error: error.message, stack: error.stack },
        });
        continue;
      }
    }

    // 各ユーザーに対してまとめ通知を送信（dryRunの場合はスキップ）
    const notificationService = new NotificationService();
    const supabase = createSupabaseClient();
    let sentCount = 0;
    let errorCount = 0;

    if (dryRun) {
      console.log("[Test Cron] DRY RUN MODE: Skipping actual notification sending");
    }

    for (const [userId, { user, items }] of notificationsByUser.entries()) {
      if (items.length === 0) {
        continue;
      }

      try {
        console.log(`[Test Cron] Processing notifications for user ${user.email} (${items.length} items)...`);

        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // ユーザーのアラート設定を取得（通知頻度を確認するため）
        const userAlertSettings = await getUserAlertSettings(user.id);
        const notificationFrequency = userAlertSettings.notification_frequency || 'daily';

        console.log(`[Test Cron] User notification settings:`, {
          email: user.email,
          locale,
          notificationFrequency,
        });

        // 通知頻度に応じて通知を送信するかどうかを判定
        if (notificationFrequency === 'none') {
          console.log(`[Test Cron] Skipping notification for user ${user.email}: notification_frequency is 'none'`);
          continue;
        }

        if (notificationFrequency === 'weekly') {
          const now = new Date();
          const dayOfWeek = now.getUTCDay();
          if (dayOfWeek !== 1) {
            console.log(`[Test Cron] Skipping notification for user ${user.email}: notification_frequency is 'weekly' but today is not Monday (dayOfWeek: ${dayOfWeek})`);
            continue;
          }
        }

        // 通知設定を取得（Slack通知を取得するため）
        const notificationSettings = await getNotificationSettings(user.id);
        console.log(`[Test Cron] Notification settings:`, {
          hasEmail: true, // メールは常に有効
          hasSlack: !!(notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id),
          slackChannelId: notificationSettings?.slack_channel_id,
        });

        if (!dryRun) {
          // メール通知を送信
          console.log(`[Test Cron] Attempting to send email notification to user ${user.email}...`, {
            itemsCount: items.length,
            locale,
          });
          try {
            await notificationService.sendBulkNotification({
              to: user.email,
              items,
              locale,
            });
            console.log(`[Test Cron] Email notification sent successfully to user ${user.email}`);
          } catch (emailError: any) {
            console.error(`[Test Cron] Failed to send email notification to user ${user.email}:`, {
              error: emailError.message,
              stack: emailError.stack,
            });
            throw emailError;
          }

          // Slack通知を送信（OAuth方式のみ）
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

              console.log(`[Test Cron] Sending Slack notification via OAuth to user ${user.email}...`);

              await sendSlackNotificationWithBot(
                notificationSettings.slack_bot_token,
                notificationSettings.slack_channel_id,
                slackPayload
              );
              console.log(`[Test Cron] Slack notification sent via OAuth to user ${user.email}`);
            } catch (slackError: any) {
              console.error(`[Test Cron] Failed to send Slack notification to user ${user.email}:`, {
                error: slackError.message,
                stack: slackError.stack,
              });
            }
          }

          // 通知履歴をDBに保存
          for (const item of items) {
            const article = articles.find((a) => a.url === item.articleUrl);
            if (article) {
              await updateArticleNotificationSent(article.url, user.id);
            }

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
                `[Test Cron] Failed to save email notification for article ${item.articleUrl}:`,
                emailNotificationError
              );
            }

            if (notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id) {
              const { error: slackNotificationError } = await supabase.from("notifications").insert({
                user_id: user.id,
                article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
                notification_type: "rank_drop",
                channel: "slack",
                recipient: notificationSettings.slack_channel_id,
                subject: items.length === 1
                  ? "【ReRank AI】順位下落を検知しました"
                  : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`,
                summary: `順位下落が検知されました（${items.length}件の記事）`,
                sent_at: new Date().toISOString(),
              });

              if (slackNotificationError) {
                console.error(
                  `[Test Cron] Failed to save Slack notification for article ${item.articleUrl}:`,
                  slackNotificationError
                );
              }
            }
          }
        } else {
          console.log(`[Test Cron] [DRY RUN] Would send notification to user ${user.email} with ${items.length} items`);
        }

        sentCount++;
        console.log(`[Test Cron] Notification processed for user ${user.email} (${items.length} articles)`);
      } catch (error: any) {
        errorCount++;
        console.error(`[Test Cron] Failed to send notification to user ${user.email}:`, error);
        continue;
      }
    }

    const result = {
      message: dryRun ? "Rank check completed (DRY RUN)" : "Rank check completed",
      dryRun,
      articlesChecked: articles.length,
      usersNotified: sentCount,
      errors: errorCount,
      totalNotifications: Array.from(notificationsByUser.values()).reduce(
        (sum, { items }) => sum + items.length,
        0
      ),
      checkResults,
    };

    console.log("[Test Cron] Rank check job completed:", result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Test Cron] Error in rank check job:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error", stack: error.stack },
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

