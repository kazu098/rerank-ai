import { NextRequest, NextResponse } from "next/server";
import { GSCApiClient } from "@/lib/gsc-api";
import { NotificationChecker } from "@/lib/notification-checker";
import { getMonitoringArticles, updateArticleNotificationSent, updateArticleAnalysis } from "@/lib/db/articles";
import { getSitesByUserId, updateSiteTokens } from "@/lib/db/sites";
import { getUserById } from "@/lib/db/users";
import { BulkNotificationItem, NotificationService } from "@/lib/notification";
import { createSupabaseClient } from "@/lib/supabase";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { getUserAlertSettings } from "@/lib/db/alert-settings";
import { getSlackIntegrationByUserId } from "@/lib/db/slack-integrations";
import { updateSiteAuthError } from "@/lib/db/sites";

/**
 * テスト用: 順位下落チェックを手動実行
 * 
 * 認証: 環境変数 CRON_SECRET で認証
 * 使用方法:
 *   curl -X GET "http://localhost:3000/api/cron/check-rank/test?dryRun=true" \
 *        -H "Authorization: Bearer YOUR_CRON_SECRET"
 *   または
 *   curl -X POST "http://localhost:3000/api/cron/check-rank/test?dryRun=true" \
 *        -H "Authorization: Bearer YOUR_CRON_SECRET"
 * 
 * クエリパラメータ:
 *   - dryRun: true の場合、通知は送信せずログのみ出力
 *   - articleId: 特定の記事IDのみをチェック（オプション）
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
        // tokenExpiresAtがnullの場合でも、リフレッシュトークンがあればリフレッシュを試みる（安全のため）
        const shouldRefresh = tokenExpiresAt 
          ? now >= tokenExpiresAt - 10 * 60 * 1000
          : refreshToken !== null; // tokenExpiresAtがnullでリフレッシュトークンがある場合、リフレッシュを試みる

        if (shouldRefresh) {
          if (!refreshToken) {
            console.warn(
              `[Test Cron] GSC access token expired or missing expiration date for site ${site.id}, but no refresh token available. Skipping article ${article.id}.`
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
            // 注意: Google OAuth 2.0では、リフレッシュトークンは通常返されない（既存のリフレッシュトークンがそのまま有効）
            // 新しいリフレッシュトークンが返された場合のみ更新し、それ以外は既存のリフレッシュトークンを保持
            await updateSiteTokens(
              site.id,
              refreshed.accessToken,
              refreshed.refreshToken ?? refreshToken, // 新しいリフレッシュトークンがあれば使用、なければ既存のものを保持
              refreshed.expiresAt
            );

            accessToken = refreshed.accessToken;
            if (refreshed.refreshToken) {
              refreshToken = refreshed.refreshToken;
            }

            console.log(`[Test Cron] Successfully refreshed GSC access token for site ${site.id}`);
          } catch (error: any) {
            console.error(
              `[Test Cron] Failed to refresh GSC access token for site ${site.id}, article ${article.id}:`,
              error.message
            );
            console.error(
              `[Test Cron] Skipping article ${article.id} due to token refresh failure. User should re-authenticate.`
            );
            
            // 認証エラーを記録
            try {
              await updateSiteAuthError(site.id);
              
              // 24時間以内に通知を送っていない場合のみメール通知を送る
              const supabase = createSupabaseClient();
              const { data: siteData } = await supabase
                .from('sites')
                .select('auth_error_at, user_id')
                .eq('id', site.id)
                .single();
              
              if (siteData) {
                const authErrorAt = siteData.auth_error_at ? new Date(siteData.auth_error_at) : null;
                const shouldNotify = !authErrorAt || (Date.now() - authErrorAt.getTime()) > 24 * 60 * 60 * 1000;
                
                if (shouldNotify) {
                  const user = await getUserById(siteData.user_id);
                  if (user?.email) {
                    const notificationService = new NotificationService();
                    const locale = (user.locale || "ja") as "ja" | "en";
                    await notificationService.sendAuthErrorNotification(
                      user.email,
                      site.site_url,
                      locale
                    );
                    console.log(`[Test Cron] Auth error notification sent to user ${user.email} for site ${site.id}`);
                  }
                } else {
                  console.log(`[Test Cron] Auth error notification already sent within 24 hours for site ${site.id}, skipping`);
                }
              }
            } catch (notifyError: any) {
              console.error(`[Test Cron] Failed to send auth error notification:`, notifyError);
            }
            
            checkResults.push({
              articleId: article.id,
              articleUrl: article.url,
              shouldNotify: false,
              reason: "Failed to refresh GSC token",
              details: { error: error.message, siteId: site.id },
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
        let checkResult;
        try {
          const checker = new NotificationChecker(gscClient);
          checkResult = await checker.checkNotificationNeeded(
            article.user_id,
            article.id,
            site.site_url,
            article.url
          );
        } catch (error: any) {
          // GSC API呼び出し時のエラーをハンドリング（特に401エラー）
          const errorMessage = error.message || String(error);
          if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('invalid_token')) {
            console.error(
              `[Test Cron] GSC API authentication error for site ${site.id}, article ${article.id}:`,
              errorMessage
            );
            
            // 401エラーの場合、リフレッシュトークンによる自動更新を試みる
            if (refreshToken) {
              console.log(`[Test Cron] Attempting to refresh GSC access token for site ${site.id} after 401 error...`);
              try {
                const refreshGscClient = new GSCApiClient(accessToken);
                const refreshed = await refreshGscClient.refreshAccessToken(refreshToken);
                
                // トークンをDBに更新
                // 注意: Google OAuth 2.0では、リフレッシュトークンは通常返されない（既存のリフレッシュトークンがそのまま有効）
                // 新しいリフレッシュトークンが返された場合のみ更新し、それ以外は既存のリフレッシュトークンを保持
                await updateSiteTokens(
                  site.id,
                  refreshed.accessToken,
                  refreshed.refreshToken ?? refreshToken, // 新しいリフレッシュトークンがあれば使用、なければ既存のものを保持
                  refreshed.expiresAt
                );
                
                console.log(`[Test Cron] Successfully refreshed GSC access token for site ${site.id} after 401 error`);
                
                // リフレッシュしたトークンで再試行
                const newGscClient = new GSCApiClient(refreshed.accessToken);
                const retryChecker = new NotificationChecker(newGscClient);
                checkResult = await retryChecker.checkNotificationNeeded(
                  article.user_id,
                  article.id,
                  site.site_url,
                  article.url
                );
                
                // 再試行が成功した場合は、通常の処理フローに戻る
                console.log(`[Test Cron] Retry successful after token refresh for article ${article.id}`);
              } catch (refreshError: any) {
                console.error(
                  `[Test Cron] Failed to refresh GSC access token for site ${site.id} after 401 error:`,
                  refreshError.message
                );
                console.error(
                  `[Test Cron] Token may be expired or invalid. Skipping article ${article.id}. User should re-authenticate.`
                );
                
                // 認証エラーを記録
                try {
                  await updateSiteAuthError(site.id);
                  
                  // 24時間以内に通知を送っていない場合のみメール通知を送る
                  const supabase = createSupabaseClient();
                  const { data: siteData } = await supabase
                    .from('sites')
                    .select('auth_error_at, user_id')
                    .eq('id', site.id)
                    .single();
                  
                  if (siteData) {
                    const authErrorAt = siteData.auth_error_at ? new Date(siteData.auth_error_at) : null;
                    const shouldNotify = !authErrorAt || (Date.now() - authErrorAt.getTime()) > 24 * 60 * 60 * 1000;
                    
                    if (shouldNotify) {
                      const user = await getUserById(siteData.user_id);
                      if (user?.email) {
                        const notificationService = new NotificationService();
                        const locale = (user.locale || "ja") as "ja" | "en";
                        await notificationService.sendAuthErrorNotification(
                          user.email,
                          site.site_url,
                          locale
                        );
                        console.log(`[Test Cron] Auth error notification sent to user ${user.email} for site ${site.id}`);
                      }
                    } else {
                      console.log(`[Test Cron] Auth error notification already sent within 24 hours for site ${site.id}, skipping`);
                    }
                  }
                } catch (notifyError: any) {
                  console.error(`[Test Cron] Failed to send auth error notification:`, notifyError);
                }
                
                checkResults.push({
                  articleId: article.id,
                  articleUrl: article.url,
                  shouldNotify: false,
                  reason: "GSC API authentication error (token expired or invalid, refresh failed)",
                  details: { error: errorMessage, refreshError: refreshError.message, siteId: site.id },
                });
                continue;
              }
            } else {
              console.error(
                `[Test Cron] No refresh token available. Skipping article ${article.id}. User should re-authenticate.`
              );
              checkResults.push({
                articleId: article.id,
                articleUrl: article.url,
                shouldNotify: false,
                reason: "GSC API authentication error (token expired or invalid, no refresh token)",
                details: { error: errorMessage, siteId: site.id },
              });
              continue;
            }
          } else {
            console.error(
              `[Test Cron] GSC API error for site ${site.id}, article ${article.id}:`,
              errorMessage
            );
            checkResults.push({
              articleId: article.id,
              articleUrl: article.url,
              shouldNotify: false,
              reason: "GSC API error",
              details: { error: errorMessage, siteId: site.id },
            });
            continue;
          }
        }

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

    // 各ユーザーに対して通知をキューに保存（通知送信は別のcronで実行）
    const supabase = createSupabaseClient();
    let sentCount = 0;
    let errorCount = 0;

    console.log(`[Test Cron] Total users with notifications: ${notificationsByUser.size}`);
    for (const [userId, { user, items }] of notificationsByUser.entries()) {
      console.log(`[Test Cron] User ${user.email}: ${items.length} notification items`);
    }

    if (dryRun) {
      console.log("[Test Cron] DRY RUN MODE: Skipping actual notification sending");
    }

    for (const [userId, { user, items }] of notificationsByUser.entries()) {
      if (items.length === 0) {
        console.log(`[Test Cron] Skipping user ${user.email}: no notification items`);
        continue;
      }

      try {
        console.log(`[Test Cron] Processing notifications for user ${user.email} (${items.length} items)...`);

        // ユーザーのロケール設定を取得（デフォルト: 'ja'）
        const locale = (user.locale || "ja") as "ja" | "en";

        // 注意: 順位チェックcronは通知をキューに保存するだけ
        // 通知頻度や通知時刻のチェックは通知送信cron（/api/cron/send-notifications）で実行される

        // 通知設定を取得（Slack通知を取得するため）
        let notificationSettings = await getNotificationSettings(user.id);
        
        // notification_settingsテーブルにレコードがない場合、slack_integrationsテーブルから直接取得
        if (!notificationSettings) {
          console.log(`[Test Cron] No notification_settings found, trying to get Slack integration directly...`);
          const slackIntegration = await getSlackIntegrationByUserId(user.id);
          if (slackIntegration) {
            // NotificationSettings形式に変換
            notificationSettings = {
              id: '',
              user_id: user.id,
              article_id: null,
              notification_type: 'rank_drop',
              channel: 'slack',
              recipient: slackIntegration.slack_channel_id || '',
              is_enabled: true,
              slack_integration_id: slackIntegration.id,
              slack_bot_token: slackIntegration.slack_bot_token,
              slack_user_id: slackIntegration.slack_user_id,
              slack_team_id: slackIntegration.slack_team_id,
              slack_channel_id: slackIntegration.slack_channel_id,
              slack_notification_type: slackIntegration.slack_notification_type,
              created_at: slackIntegration.created_at,
              updated_at: slackIntegration.updated_at,
            };
            console.log(`[Test Cron] Found Slack integration directly from slack_integrations table`);
          }
        }
        
        console.log(`[Test Cron] Notification settings:`, {
          hasEmail: true, // メールは常に有効
          hasSlack: !!(notificationSettings?.slack_bot_token && notificationSettings?.slack_channel_id),
          slackChannelId: notificationSettings?.slack_channel_id,
          slackNotificationType: notificationSettings?.slack_notification_type,
          slackTeamId: notificationSettings?.slack_team_id,
          slackBotTokenPrefix: notificationSettings?.slack_bot_token ? notificationSettings.slack_bot_token.substring(0, 10) + '...' : 'null',
          slackBotTokenExists: !!notificationSettings?.slack_bot_token,
          slackChannelIdExists: !!notificationSettings?.slack_channel_id,
          notificationSettingsExists: !!notificationSettings,
        });

        // 通知履歴をDBに保存（sent_atはNULL、通知送信cronで送信）
        // 注意: テストエンドポイントでも通知は送信せず、キューに保存するだけ
        for (const item of items) {
          const article = articles.find((a) => a.url === item.articleUrl);
          if (!article) {
            console.warn(`[Test Cron] Article not found for URL: ${item.articleUrl}`);
            continue;
          }

          // 通知内容の詳細データをJSONBで保存
          const notificationData = {
            articleUrl: item.articleUrl,
            articleTitle: item.articleTitle,
            articleId: item.articleId,
            notificationType: item.notificationType,
            rankDropInfo: item.rankDropInfo,
            rankRiseInfo: item.rankRiseInfo,
            analysisResult: item.analysisResult,
          };

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
            article_id: article.id,
            notification_type: notificationType,
            channel: "email",
            recipient: user.email,
            subject,
            summary,
            notification_data: notificationData,
            sent_at: null, // 通知送信cronで送信されるまでNULL
          });

          if (emailNotificationError) {
            console.error(
              `[Test Cron] Failed to save email notification for article ${item.articleUrl}:`,
              emailNotificationError
            );
          } else {
            console.log(`[Test Cron] Email notification queued for article ${item.articleUrl}`);
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

            // 通知内容の詳細データをJSONBで保存（メール通知と同じデータを使用）
            const { error: slackNotificationError } = await supabase.from("notifications").insert({
              user_id: user.id,
              article_id: article.id,
              notification_type: slackNotificationType,
              channel: "slack",
              recipient: notificationSettings.slack_channel_id, // チャンネルIDまたはUser IDを保存
              subject: slackSubject,
              summary: slackSummary,
              notification_data: notificationData, // メール通知と同じデータを使用
              sent_at: null, // 通知送信cronで送信されるまでNULL
            });

            if (slackNotificationError) {
              console.error(
                `[Test Cron] Failed to save Slack notification for article ${item.articleUrl}:`,
                slackNotificationError
              );
            } else {
              console.log(`[Test Cron] Slack notification queued for article ${item.articleUrl}`);
            }
          }
        }

        if (dryRun) {
          console.log(`[Test Cron] [DRY RUN] Would queue ${items.length} notifications for user ${user.email}`);
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

