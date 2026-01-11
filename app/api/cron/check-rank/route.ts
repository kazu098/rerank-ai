import { NextRequest, NextResponse } from "next/server";
import { GSCApiClient } from "@/lib/gsc-api";
import { NotificationChecker } from "@/lib/notification-checker";
import { getMonitoringArticles, getMonitoringArticlesForSlot, updateArticleAnalysis } from "@/lib/db/articles";
import { getSitesByUserId, getSiteById, updateSiteTokens, updateSiteAuthError, convertUrlPropertyToDomainProperty, updateSiteUrl } from "@/lib/db/sites";
import { getUserById } from "@/lib/db/users";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";
import { createSupabaseClient } from "@/lib/supabase";
import { sendSlackNotificationWithBot, formatSlackBulkNotification } from "@/lib/slack-notification";
import { getNotificationSettings, getNotificationSettingsByChannel } from "@/lib/db/notification-settings";
import { getUserAlertSettings } from "@/lib/db/alert-settings";
import { getSlackIntegrationByUserId } from "@/lib/db/slack-integrations";
import { getCurrentTimeSlot } from "@/lib/cron/slot-calculator";

/**
 * 認証エラー（401/403）を処理し、必要に応じてユーザーに通知を送る
 * @param errorType '401' | '403' - エラーの種類（401: 認証エラー、403: 権限エラー）
 */
async function handleAuthError(siteId: string, siteUrl: string, errorType: '401' | '403' = '401'): Promise<void> {
  try {
    // 24時間以内に通知を送っていない場合のみメール通知を送る
    // auth_error_atを更新する前にチェックする必要がある
    const supabase = createSupabaseClient();
    const { data: siteData } = await supabase
      .from('sites')
      .select('auth_error_at, user_id')
      .eq('id', siteId)
      .single();
    
    if (!siteData) {
      console.error(`[Cron] Site data not found for site ${siteId}`);
      return;
    }

    const authErrorAt = siteData.auth_error_at ? new Date(siteData.auth_error_at) : null;
    const shouldNotify = !authErrorAt || (Date.now() - authErrorAt.getTime()) > 24 * 60 * 60 * 1000;
    
    // auth_error_atを更新（エラー時刻を記録）
    await updateSiteAuthError(siteId);
    
    if (shouldNotify) {
      const user = await getUserById(siteData.user_id);
      if (user?.email) {
        const notificationService = new NotificationService();
        const locale = (user.locale || "ja") as "ja" | "en";
        await notificationService.sendAuthErrorNotification(
          user.email,
          siteUrl,
          locale,
          errorType
        );
        console.log(`[Cron] Auth error notification sent to user ${user.email} for site ${siteId} (error type: ${errorType})`);
      } else {
        console.log(`[Cron] User email not found for site ${siteId}`);
      }
    } else {
      const hoursAgo = Math.floor((Date.now() - (authErrorAt?.getTime() || 0)) / (1000 * 60 * 60));
      console.log(`[Cron] Auth error notification already sent ${hoursAgo} hours ago for site ${siteId}, skipping (24 hour cooldown)`);
    }
  } catch (notifyError: any) {
    console.error(`[Cron] Failed to send auth error notification:`, notifyError);
  }
}

/**
 * Cronジョブ: 順位下落をチェックして通知キューに保存
 * 実行頻度: 1日1回（日本時刻 0:00 = UTC 15:00、GSC APIのデータは1日単位で更新されるため）
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
  // Cronジョブの認証（GitHub Actionsからのリクエストか確認）
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // スロットパラメータを取得（時間分散処理用）
    const searchParams = request.nextUrl.searchParams;
    const slotParam = searchParams.get("slot");
    const totalSlots = 24; // 1日を24スロット（1時間ごと）に分割

    // スロットが指定されていない場合は現在のスロットを使用
    const currentSlot = slotParam !== null 
      ? parseInt(slotParam, 10) 
      : getCurrentTimeSlot(totalSlots);

    if (isNaN(currentSlot) || currentSlot < 0 || currentSlot >= totalSlots) {
      return NextResponse.json(
        { error: `Invalid slot parameter. Must be between 0 and ${totalSlots - 1}` },
        { status: 400 }
      );
    }

    console.log(`[Cron] Starting rank check job for slot ${currentSlot}/${totalSlots}...`);

    // 該当スロットの監視対象の記事を取得
    const articles = await getMonitoringArticlesForSlot(currentSlot, totalSlots);
    console.log(`[Cron] Found ${articles.length} monitoring articles for slot ${currentSlot}`);

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
    
    // サイト情報をキャッシュ（同じサイトの複数記事を処理する際に効率化）
    const siteCache: Map<string, { site: any; userId: string }> = new Map();

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

        // サイト情報をキャッシュから取得、またはDBから取得
        let site: any;
        const cachedSite = siteCache.get(article.site_id);
        if (cachedSite && cachedSite.userId === article.user_id) {
          site = cachedSite.site;
        } else {
          const sites = await getSitesByUserId(article.user_id);
          site = sites.find((s) => s.id === article.site_id);
          if (site) {
            siteCache.set(article.site_id, { site, userId: article.user_id });
          }
        }
        
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

        // リフレッシュトークンが空文字列の場合はnullとして扱う
        if (refreshToken && refreshToken.trim() === '') {
          refreshToken = null;
        }

        // トークンが期限切れまたは期限切れ間近（10分前）の場合、リフレッシュを試みる
        // tokenExpiresAtがnullの場合でも、リフレッシュトークンがあればリフレッシュを試みる（安全のため）
        const shouldRefresh = tokenExpiresAt 
          ? now >= tokenExpiresAt - 10 * 60 * 1000
          : refreshToken !== null && refreshToken !== ''; // tokenExpiresAtがnullでリフレッシュトークンがある場合、リフレッシュを試みる

        if (shouldRefresh) {
          if (!refreshToken || refreshToken.trim() === '') {
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
          // デバッグログ: GSC API呼び出し前の情報を出力
          console.log(`[Cron] Calling GSC API for site ${site.id}, article ${article.id}:`, {
            siteUrl: site.site_url,
            articleUrl: article.url,
            accessTokenPrefix: accessToken ? `${accessToken.substring(0, 20)}...` : 'null',
            hasRefreshToken: !!refreshToken,
            tokenExpiresAt: site.gsc_token_expires_at,
          });
          
          const checker = new NotificationChecker(gscClient);
          checkResult = await checker.checkNotificationNeeded(
            article.user_id,
            article.id,
            site.site_url,
            article.url
          );
          
          // デバッグログ: 通知判定結果を出力
          console.log(`[Cron] Notification check result for article ${article.id}:`, {
            shouldNotify: checkResult.shouldNotify,
            notificationType: checkResult.notificationType,
            reason: checkResult.reason,
            settings: {
              drop_threshold: checkResult.settings.drop_threshold,
              keyword_drop_threshold: checkResult.settings.keyword_drop_threshold,
              consecutive_drop_days: checkResult.settings.consecutive_drop_days,
              min_impressions: checkResult.settings.min_impressions,
              comparison_days: checkResult.settings.comparison_days,
            },
            rankDropResult: {
              hasDrop: checkResult.rankDropResult.hasDrop,
              dropAmount: checkResult.rankDropResult.dropAmount,
              droppedKeywordsCount: checkResult.rankDropResult.droppedKeywords?.length || 0,
            },
          });
        } catch (error: any) {
          // GSC API呼び出し時のエラーをハンドリング（特に401/403エラー）
          const errorMessage = error.message || String(error);
          const is401Error = errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('invalid_token');
          const is403Error = errorMessage.includes('403') || errorMessage.includes('Forbidden') || errorMessage.includes('permission');
          
          if (is401Error || is403Error) {
            const errorType = is401Error ? '401' : '403';
            console.error(
              `[Cron] GSC API ${errorType} error for site ${site.id}, article ${article.id}:`,
              errorMessage
            );
            
            if (is401Error) {
              // 401エラーの場合、リフレッシュトークンによる自動更新を試みる
              // リフレッシュトークンが空文字列の場合はnullとして扱う
              const validRefreshToken = refreshToken && refreshToken.trim() !== '' ? refreshToken : null;
              if (validRefreshToken) {
              console.log(`[Cron] Attempting to refresh GSC access token for site ${site.id} after 401 error...`);
              try {
                const refreshGscClient = new GSCApiClient(accessToken);
                const refreshed = await refreshGscClient.refreshAccessToken(validRefreshToken);
                
                // トークンをDBに更新
                // 注意: Google OAuth 2.0では、リフレッシュトークンは通常返されない（既存のリフレッシュトークンがそのまま有効）
                // 新しいリフレッシュトークンが返された場合のみ更新し、それ以外は既存のリフレッシュトークンを保持
                await updateSiteTokens(
                  site.id,
                  refreshed.accessToken,
                  refreshed.refreshToken ?? validRefreshToken, // 新しいリフレッシュトークンがあれば使用、なければ既存のものを保持
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
                
                // リフレッシュしたトークンをローカル変数に更新（後の処理で使用）
                accessToken = refreshed.accessToken;
                if (refreshed.refreshToken) {
                  refreshToken = refreshed.refreshToken;
                } else {
                  refreshToken = validRefreshToken; // 新しいリフレッシュトークンが返されない場合は既存のものを保持
                }
              } catch (refreshError: any) {
                console.error(
                  `[Cron] Failed to refresh GSC access token for site ${site.id} after 401 error:`,
                  refreshError.message
                );
                console.error(
                  `[Cron] Token may be expired or invalid. Skipping article ${article.id}. User should re-authenticate.`
                );
                
                // 認証エラーを記録して通知を送る
                await handleAuthError(site.id, site.site_url, '401');
                continue;
              }
            } else {
                // 401エラーでリフレッシュトークンが存在しない場合
                console.error(
                  `[Cron] GSC API authentication error for site ${site.id}, article ${article.id}: No refresh token available. User should re-authenticate.`
                );
                
                // 認証エラーを記録して通知を送る
                await handleAuthError(site.id, site.site_url, '401');
                continue;
              }
            } else if (is403Error) {
              // 403エラー（権限不足）の場合
              console.error(
                `[Cron] GSC API permission error for site ${site.id}, article ${article.id}: User does not have permission for this site.`
              );
              console.error(
                `[Cron] Site URL: ${site.site_url}, Error message: ${errorMessage}`
              );
              
              // デバッグ情報: トークンとサイト情報を出力
              console.error(`[Cron] 403 Error Debug Info:`, {
                siteId: site.id,
                siteUrl: site.site_url,
                userId: article.user_id,
                userEmail: user.email,
                hasAccessToken: !!accessToken,
                accessTokenPrefix: accessToken ? `${accessToken.substring(0, 20)}...` : 'null',
                hasRefreshToken: !!refreshToken,
                refreshTokenPrefix: refreshToken ? `${refreshToken.substring(0, 20)}...` : 'null',
                tokenExpiresAt: site.gsc_token_expires_at,
                authErrorAt: site.auth_error_at,
                errorMessage: errorMessage,
              });
              
              // URLプロパティ形式の場合、ドメインプロパティ形式に変換して再試行
              const domainPropertyUrl = convertUrlPropertyToDomainProperty(site.site_url);
              if (domainPropertyUrl) {
                console.log(`[Cron] Attempting to retry with domain property format: ${domainPropertyUrl}`);
                try {
                  // ドメインプロパティ形式でGSC APIを再試行
                  const retryGscClient = new GSCApiClient(accessToken);
                  const retryChecker = new NotificationChecker(retryGscClient);
                  const retryCheckResult = await retryChecker.checkNotificationNeeded(
                    article.user_id,
                    article.id,
                    domainPropertyUrl,
                    article.url
                  );
                  
                  // 再試行が成功した場合、サイトURLを更新して通常の処理フローに戻る
                  console.log(`[Cron] Retry successful with domain property format for site ${site.id}, updating site URL from ${site.site_url} to ${domainPropertyUrl}`);
                  await updateSiteUrl(site.id, domainPropertyUrl);
                  // DB更新後、最新のサイト情報を再取得してキャッシュを更新（次の記事処理で正しいURLを使用するため）
                  const updatedSite = await getSiteById(site.id);
                  if (updatedSite) {
                    site.site_url = updatedSite.site_url;
                    // キャッシュも更新（キーはarticle.site_idで統一）
                    siteCache.set(article.site_id, { site: updatedSite, userId: article.user_id });
                    console.log(`[Cron] Site URL updated in memory and cache: ${site.site_url}`);
                  } else {
                    site.site_url = domainPropertyUrl;
                    // キャッシュも更新（キーはarticle.site_idで統一）
                    siteCache.set(article.site_id, { site: { ...site, site_url: domainPropertyUrl }, userId: article.user_id });
                  }
                  checkResult = retryCheckResult;
                  
                  // 再試行成功後の通知チェック結果をログ出力
                  console.log(`[Cron] Notification check result after domain property retry for article ${article.id}:`, {
                    shouldNotify: checkResult.shouldNotify,
                    notificationType: checkResult.notificationType,
                    reason: checkResult.reason,
                    settings: {
                      drop_threshold: checkResult.settings.drop_threshold,
                      keyword_drop_threshold: checkResult.settings.keyword_drop_threshold,
                      consecutive_drop_days: checkResult.settings.consecutive_drop_days,
                      min_impressions: checkResult.settings.min_impressions,
                      comparison_days: checkResult.settings.comparison_days,
                    },
                    rankDropResult: {
                      hasDrop: checkResult.rankDropResult?.hasDrop,
                      dropAmount: checkResult.rankDropResult?.dropAmount,
                      droppedKeywordsCount: checkResult.rankDropResult?.droppedKeywords?.length || 0,
                    },
                    rankRiseResult: {
                      hasRise: checkResult.rankRiseResult?.hasRise,
                      riseAmount: checkResult.rankRiseResult?.riseAmount,
                      risenKeywordsCount: checkResult.rankRiseResult?.risenKeywords?.length || 0,
                    },
                  });
                } catch (retryError: any) {
                  const retryErrorMessage = retryError.message || String(retryError);
                  console.error(
                    `[Cron] Retry with domain property format also failed for site ${site.id}, article ${article.id}:`,
                    retryErrorMessage
                  );
                  console.error(`[Cron] Auto-retry failed details:`, {
                    siteId: site.id,
                    siteUrl: site.site_url,
                    domainPropertyUrl: domainPropertyUrl,
                    articleId: article.id,
                    articleUrl: article.url,
                    userId: article.user_id,
                    userEmail: user.email,
                    errorMessage: retryErrorMessage,
                    errorType: retryErrorMessage.includes('403') ? '403' : retryErrorMessage.includes('401') ? '401' : 'unknown',
                  });
                  
                  // 再試行も失敗した場合、通常の403エラーハンドリングに進む
                  console.log(`[Cron] Auto-retry failed, proceeding to handleAuthError for site ${site.id}`);
                  await handleAuthError(site.id, site.site_url, '403');
                  console.log(`[Cron] handleAuthError completed, skipping article ${article.id}`);
                  continue;
                }
              } else {
                // URLプロパティ形式でない場合（すでにドメインプロパティ形式）、通常の403エラーハンドリングに進む
                console.log(`[Cron] Site URL is not URL property format (already domain property or other format), proceeding to handleAuthError for site ${site.id}`);
                console.log(`[Cron] Site URL format info:`, {
                  siteId: site.id,
                  siteUrl: site.site_url,
                  isDomainProperty: site.site_url.startsWith('sc-domain:'),
                  isUrlProperty: site.site_url.startsWith('https://') || site.site_url.startsWith('http://'),
                  articleId: article.id,
                  userId: article.user_id,
                  userEmail: user.email,
                });
                await handleAuthError(site.id, site.site_url, '403');
                console.log(`[Cron] handleAuthError completed, skipping article ${article.id}`);
                continue;
              }
            }
          } else {
            // その他のGSC APIエラー
            console.error(
              `[Cron] GSC API error for site ${site.id}, article ${article.id}:`,
              errorMessage
            );
            continue;
          }
        }

        // 順位データをDBに保存（通知が必要かどうかに関わらず更新）
        // checkResultがundefinedの場合はスキップ（エラーが発生した場合）
        if (!checkResult) {
          continue;
        }

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
            
            console.log(`[Cron] Updated article analysis data for article ${article.id}:`, {
              currentPosition,
              previousPosition,
            });
          }
        } catch (updateError: any) {
          console.error(`[Cron] Failed to update article analysis for article ${article.id}:`, updateError);
          // エラーが発生しても処理を続行
        }

        if (!checkResult.shouldNotify) {
          console.log(
            `[Cron] Notification not needed for article ${article.id}: ${checkResult.reason.key}`
          );
          continue;
        }

        // 通知が必要な場合、ユーザーごとにまとめる
        console.log(`[Cron] Adding notification item for article ${article.id} (user: ${user.email}):`, {
          articleUrl: article.url,
          articleTitle: article.title,
          notificationType: checkResult.notificationType,
          shouldNotify: checkResult.shouldNotify,
        });
        
        if (!notificationsByUser.has(article.user_id)) {
          notificationsByUser.set(article.user_id, {
            user: user, // 完全なUserオブジェクトを保存（localeを含む）
            items: [],
          });
          console.log(`[Cron] Created notification group for user ${user.email}`);
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

        // 通知設定をチャネル別に取得（メールとSlackを別々に取得）
        const notificationSettingsByChannel = await getNotificationSettingsByChannel(user.id);
        const emailSettings = notificationSettingsByChannel.email;
        const slackSettings = notificationSettingsByChannel.slack;
        
        console.log(`[Cron] Notification settings for user ${user.email}:`, {
          emailEnabled: emailSettings?.is_enabled ?? true, // デフォルトは有効
          slackEnabled: slackSettings?.is_enabled ?? false, // デフォルトは無効
          hasSlackBotToken: !!slackSettings?.slack_bot_token,
          hasSlackChannelId: !!slackSettings?.slack_channel_id,
          slackChannelId: slackSettings?.slack_channel_id,
          slackNotificationType: slackSettings?.slack_notification_type,
          slackTeamId: slackSettings?.slack_team_id,
        });

        // 通知履歴をDBに保存（sent_atはNULL、通知送信cronで送信）
        for (const item of items) {
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

          // メール通知の作成（is_enabledをチェック）
          const emailEnabled = emailSettings?.is_enabled ?? true; // デフォルトは有効
          if (emailEnabled) {
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
            } else {
              console.log(`[Cron] Email notification record created for user ${user.email}:`, {
                articleId: item.articleId,
                articleUrl: item.articleUrl,
                notificationType: notificationType,
                subject: subject,
              });
            }
          } else {
            console.log(`[Cron] Email notification disabled for user ${user.email}, skipping`);
          }

          // Slack通知の作成（is_enabledをチェック）
          const slackEnabled = slackSettings?.is_enabled ?? false; // デフォルトは無効
          if (slackEnabled && slackSettings) {
            const hasSlackBotToken = !!slackSettings.slack_bot_token;
            const hasSlackRecipient = slackSettings.slack_notification_type === 'dm'
              ? !!slackSettings.slack_user_id
              : !!slackSettings.slack_channel_id;
            
            if (hasSlackBotToken && hasSlackRecipient) {
              const slackNotificationType = item.notificationType || 'rank_drop';
              const isSlackRise = slackNotificationType === 'rank_rise';
              const slackSubject = items.length === 1
                ? (isSlackRise ? "【ReRank AI】順位上昇を検知しました" : "【ReRank AI】順位下落を検知しました")
                : (isSlackRise ? `【ReRank AI】順位上昇を検知しました（${items.length}件の記事）` : `【ReRank AI】順位下落を検知しました（${items.length}件の記事）`);
              const slackSummary = isSlackRise
                ? `順位上昇が検知されました（${items.length}件の記事）`
                : `順位下落が検知されました（${items.length}件の記事）`;

              // DMの場合はslack_user_id、チャンネルの場合はslack_channel_idを使用
              const recipientId = slackSettings.slack_notification_type === 'dm'
                ? slackSettings.slack_user_id!
                : slackSettings.slack_channel_id!;

              console.log(`[Cron] Creating Slack notification record for user ${user.email}:`, {
                notificationType: slackSettings.slack_notification_type,
                recipientId,
                channelId: slackSettings.slack_channel_id,
                userId: slackSettings.slack_user_id,
              });

              // 通知内容の詳細データをJSONBで保存（メール通知と同じデータを使用）
              const { error: slackNotificationError } = await supabase.from("notifications").insert({
                user_id: user.id,
                article_id: articles.find((a) => a.url === item.articleUrl)?.id || null,
                notification_type: slackNotificationType,
                channel: "slack",
                recipient: recipientId, // DMの場合はslack_user_id、チャンネルの場合はslack_channel_id
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
              } else {
                console.log(`[Cron] Slack notification record created successfully for user ${user.email}`);
              }
            } else {
              console.warn(`[Cron] Skipping Slack notification record creation for user ${user.email}:`, {
                hasSlackBotToken,
                hasSlackRecipient,
                notificationType: slackSettings.slack_notification_type,
                hasChannelId: !!slackSettings.slack_channel_id,
                hasUserId: !!slackSettings.slack_user_id,
              });
            }
          } else {
            console.log(`[Cron] Slack notification disabled or not configured for user ${user.email}, skipping`);
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
      slot: currentSlot,
      totalSlots: totalSlots,
      articlesChecked: articles.length,
      usersQueued: sentCount,
      errors: errorCount,
      totalNotifications: Array.from(notificationsByUser.values()).reduce(
        (sum, { items }) => sum + items.length,
        0
      ),
    };

    console.log("[Cron] Rank check job completed:", result);
    console.log("[Cron] Detailed summary:", {
      slot: currentSlot,
      totalSlots: totalSlots,
      articlesChecked: articles.length,
      usersWithNotifications: notificationsByUser.size,
      notificationsByUser: Array.from(notificationsByUser.entries()).map(([userId, { user, items }]) => ({
        userId,
        userEmail: user.email,
        notificationCount: items.length,
        notificationTypes: items.map(item => item.notificationType),
      })),
      errors: errorCount,
      totalNotifications: result.totalNotifications,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Cron] Error in rank check job:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

