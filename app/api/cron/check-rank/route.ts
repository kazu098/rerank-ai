import { NextRequest, NextResponse } from "next/server";
import { GSCApiClient } from "@/lib/gsc-api";
import { NotificationChecker } from "@/lib/notification-checker";
import { getMonitoringArticles } from "@/lib/db/articles";
import { getSitesByUserId, updateSiteTokens, updateSiteAuthError } from "@/lib/db/sites";
import { getUserById } from "@/lib/db/users";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { createSupabaseClient } from "@/lib/supabase";
import { createSupabaseClient } from "@/lib/supabase";
import { sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { getNotificationSettings } from "@/lib/db/notification-settings";
import { getUserAlertSettings } from "@/lib/db/alert-settings";
import { getSlackIntegrationByUserId } from "@/lib/db/slack-integrations";

/**
 * Cronジョブ: 順位下落をチェックして通知キューに保存
 * 実行頻度: 1日1回（UTC 0時、GSC APIのデータは1日単位で更新されるため）
 * 
 * 処理フロー:
 * 1. 監視対象の記事を取得
 * 2. 各記事に対して通知判定を実行
 * 3. 通知が必要な記事をユーザーごとにまとめる
 * 4. 通知履歴をDBに保存（sent_atはNULL、通知送信cronで送信）
 * 
 * 注意: 通知送信は別のcronジョブ（/api/cron/send-notifications）で実行される。
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
        // tokenExpiresAtがnullの場合でも、リフレッシュトークンがあればリフレッシュを試みる（安全のため）
        const shouldRefresh = tokenExpiresAt 
          ? now >= tokenExpiresAt - 10 * 60 * 1000
          : refreshToken !== null; // tokenExpiresAtがnullでリフレッシュトークンがある場合、リフレッシュを試みる

        if (shouldRefresh) {
          if (!refreshToken) {
            console.warn(
              `[Cron] GSC access token expired or missing expiration date for site ${site.id}, but no refresh token available. Skipping article ${article.id}.`
            );
            continue;
          }

          try {
            console.log(`[Cron] Refreshing GSC access token for site ${site.id}...`);
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

            console.log(`[Cron] Successfully refreshed GSC access token for site ${site.id}`);
          } catch (error: any) {
            console.error(
              `[Cron] Failed to refresh GSC access token for site ${site.id}, article ${article.id}:`,
              error.message
            );
            console.error(
              `[Cron] Skipping article ${article.id} due to token refresh failure. User should re-authenticate.`
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
                    console.log(`[Cron] Auth error notification sent to user ${user.email} for site ${site.id}`);
                  }
                } else {
                  console.log(`[Cron] Auth error notification already sent within 24 hours for site ${site.id}, skipping`);
                }
              }
            } catch (notifyError: any) {
              console.error(`[Cron] Failed to send auth error notification:`, notifyError);
            }
            
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
              `[Cron] GSC API authentication error for site ${site.id}, article ${article.id}:`,
              errorMessage
            );
            
            // 401エラーの場合、リフレッシュトークンによる自動更新を試みる
            if (refreshToken) {
              console.log(`[Cron] Attempting to refresh GSC access token for site ${site.id} after 401 error...`);
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
                
                console.log(`[Cron] Successfully refreshed GSC access token for site ${site.id} after 401 error`);
                
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
                console.log(`[Cron] Retry successful after token refresh for article ${article.id}`);
              } catch (refreshError: any) {
                console.error(
                  `[Cron] Failed to refresh GSC access token for site ${site.id} after 401 error:`,
                  refreshError.message
                );
                console.error(
                  `[Cron] Token may be expired or invalid. Skipping article ${article.id}. User should re-authenticate.`
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
                        console.log(`[Cron] Auth error notification sent to user ${user.email} for site ${site.id}`);
                      }
                    } else {
                      console.log(`[Cron] Auth error notification already sent within 24 hours for site ${site.id}, skipping`);
                    }
                  }
                } catch (notifyError: any) {
                  console.error(`[Cron] Failed to send auth error notification:`, notifyError);
                }
                
                continue;
              }
            } else {
              console.error(
                `[Cron] Token may be expired or invalid. Skipping article ${article.id}. User should re-authenticate.`
              );
              continue;
            }
          } else {
            console.error(
              `[Cron] GSC API error for site ${site.id}, article ${article.id}:`,
              errorMessage
            );
            continue;
          }
        }

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

        // ユーザーのアラート設定を取得（通知頻度と通知時刻を確認するため）
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

        // 通知設定を取得（Slack通知の設定を取得するため）
        let notificationSettings = await getNotificationSettings(user.id);
        
        // notification_settingsテーブルにレコードがない場合、slack_integrationsテーブルから直接取得
        if (!notificationSettings) {
          console.log(`[Cron] No notification_settings found for user ${user.email}, trying to get Slack integration directly...`);
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
            console.log(`[Cron] Found Slack integration directly from slack_integrations table for user ${user.email}`);
          }
        }
        
        console.log(`[Cron] Notification settings for user ${user.email}:`, {
          hasSlackBotToken: !!notificationSettings?.slack_bot_token,
          hasSlackChannelId: !!notificationSettings?.slack_channel_id,
          slackChannelId: notificationSettings?.slack_channel_id,
          slackNotificationType: notificationSettings?.slack_notification_type,
          slackTeamId: notificationSettings?.slack_team_id,
          notificationSettingsExists: !!notificationSettings,
        });

        // 通知履歴をDBに保存（sent_atはNULL、通知送信cronで送信）
        for (const item of items) {
          // notificationsテーブルにレコードを作成（メール通知）
          const notificationType = item.notificationType || 'rank_drop';
          const isRise = notificationType === 'rank_rise';
          const subject = items.length === 1
            ? (isRise ? "【ReRank AI】順位上昇を検知しました" : "【ReRank AI】順位下落を検知しました")
            : (isRise ? `【ReRank AI】順位上昇を検知しました（${items.length}件の記事）` : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`);
          const summary = isRise
            ? `順位上昇が検知されました（${items.length}件の記事）`
            : `順位下落が検知されました（${items.length}件の記事）`;

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

          const { error: emailNotificationError } = await supabase.from("notifications").insert({
            user_id: user.id,
            article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
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

            // 通知内容の詳細データをJSONBで保存（メール通知と同じデータを使用）
            const { error: slackNotificationError } = await supabase.from("notifications").insert({
              user_id: user.id,
              article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
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
                `[Cron] Failed to save Slack notification for article ${item.articleUrl}:`,
                slackNotificationError
              );
            }
          }
        }

        sentCount++;
        console.log(`[Cron] Notifications queued for user ${user.email} (${items.length} articles)`);
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
      usersQueued: sentCount,
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

