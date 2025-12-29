import { GSCApiClient } from "./gsc-api";
import { RankDropDetector, RankDropResult, RankRiseResult } from "./rank-drop-detection";
import { getNotificationSettings, DEFAULT_NOTIFICATION_SETTINGS } from "./db/notification-settings";
import { getUserAlertSettings, DEFAULT_ALERT_SETTINGS } from "./db/alert-settings";
import { getArticleById } from "./db/articles";
import { getUserById } from "./db/users";
import { createSupabaseClient } from "./supabase";

export interface NotificationCheckResult {
  shouldNotify: boolean;
  notificationType: 'rank_drop' | 'rank_rise' | null;
  reason: {
    key: string;
    params?: Record<string, string | number>;
  };
  rankDropResult: RankDropResult;
  rankRiseResult?: RankRiseResult;
  settings: {
    drop_threshold: number;
    keyword_drop_threshold: number;
    comparison_days: number;
    consecutive_drop_days: number;
    min_impressions: number;
    notification_cooldown_days: number;
    rise_threshold?: number;
    notify_on_rise?: boolean;
  };
}

/**
 * 通知判定ロジック
 * 閾値をハードコードせず、設定から取得
 */
export class NotificationChecker {
  private client: GSCApiClient;
  private detector: RankDropDetector;

  constructor(client: GSCApiClient) {
    this.client = client;
    this.detector = new RankDropDetector(client);
  }

  /**
   * 通知が必要かどうかを判定
   * @param userId ユーザーID
   * @param articleId 記事ID
   * @param siteUrl サイトURL
   * @param pageUrl ページURL
   */
  async checkNotificationNeeded(
    userId: string,
    articleId: string,
    siteUrl: string,
    pageUrl: string
  ): Promise<NotificationCheckResult> {
    // 記事情報を取得
    const article = await getArticleById(articleId);
    if (!article) {
      throw new Error(`Article not found: ${articleId}`);
    }

    // ユーザー情報を取得（タイムゾーン取得のため）
    const user = await getUserById(userId);
    const userTimezone = user?.timezone || 'UTC';

    // 通知設定を取得（通知チャネル関連の設定のみ：メール/Slackの有効/無効、通知時刻など）
    const settings = await getNotificationSettings(userId, articleId);
    
    // ユーザーのアラート設定を取得（全ての記事に適用される閾値や比較期間）
    const userAlertSettings = await getUserAlertSettings(userId);
    
    // 通知設定から通知チャネル関連の設定を取得（なければデフォルト）
    const notificationChannelSettings = settings || {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      user_id: userId,
      article_id: articleId,
    } as any;

    // アラート設定は全てuser_alert_settingsから取得（記事固有の設定は不要）
    const effectiveSettings = {
      ...notificationChannelSettings,
      // アラート設定はuser_alert_settingsから取得
      drop_threshold: userAlertSettings.position_drop_threshold,
      keyword_drop_threshold: userAlertSettings.keyword_drop_threshold,
      comparison_days: userAlertSettings.comparison_days,
      consecutive_drop_days: userAlertSettings.consecutive_drop_days,
      min_impressions: userAlertSettings.min_impressions,
      notification_cooldown_days: userAlertSettings.notification_cooldown_days,
      // 通知時刻とタイムゾーンもuser_alert_settingsから取得
      notification_time: userAlertSettings.notification_time,
      timezone: userAlertSettings.timezone || userTimezone,
    };

    // 修正済みフラグが立っている場合は、順位上昇を優先的にチェック
    if (article.is_fixed) {
      const fixedAt = article.fixed_at ? new Date(article.fixed_at) : null;
      const cooldownDays = effectiveSettings.notification_cooldown_days || DEFAULT_ALERT_SETTINGS.notification_cooldown_days;
      
      if (fixedAt) {
        const daysSinceFixed = Math.floor(
          (Date.now() - fixedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // クールダウン期間内の場合は、順位上昇をチェック（順位下落はチェックしない）
        if (daysSinceFixed < cooldownDays) {
          const riseThreshold = effectiveSettings.drop_threshold || DEFAULT_ALERT_SETTINGS.position_drop_threshold;
          const rankRiseResult = await this.detector.detectRankRise(
            siteUrl,
            pageUrl,
            effectiveSettings.comparison_days || DEFAULT_ALERT_SETTINGS.comparison_days,
            riseThreshold
          );

          if (rankRiseResult.hasRise) {
            return {
              shouldNotify: true,
              notificationType: 'rank_rise',
              reason: {
                key: 'notification.checker.rankRiseDetected',
                params: {
                  from: rankRiseResult.baseAveragePosition.toFixed(1),
                  to: rankRiseResult.currentAveragePosition.toFixed(1),
                  rise: rankRiseResult.riseAmount.toFixed(1),
                },
              },
              rankDropResult: {} as RankDropResult,
              rankRiseResult,
              settings: {
                drop_threshold: effectiveSettings.drop_threshold,
                keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
                comparison_days: effectiveSettings.comparison_days,
                consecutive_drop_days: effectiveSettings.consecutive_drop_days,
                min_impressions: effectiveSettings.min_impressions,
                notification_cooldown_days: effectiveSettings.notification_cooldown_days,
              },
            };
          }

          // 順位上昇がない場合は通知しない
          return {
            shouldNotify: false,
            notificationType: null,
            reason: {
              key: 'notification.checker.fixedArticleNoRise',
              params: { days: cooldownDays },
            },
            rankDropResult: {} as RankDropResult,
            settings: {
              drop_threshold: effectiveSettings.drop_threshold,
              keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
              comparison_days: effectiveSettings.comparison_days,
              consecutive_drop_days: effectiveSettings.consecutive_drop_days,
              min_impressions: effectiveSettings.min_impressions,
              notification_cooldown_days: effectiveSettings.notification_cooldown_days,
            },
          };
        }
      }
    }

    // 通知頻度制限のチェック（過去7日間で1回まで）
    const cooldownDays = effectiveSettings.notification_cooldown_days || DEFAULT_ALERT_SETTINGS.notification_cooldown_days;
    if (article.last_notification_sent_at) {
      const lastSent = new Date(article.last_notification_sent_at);
      const daysSinceLastNotification = Math.floor(
        (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24)
      );
      
        if (daysSinceLastNotification < cooldownDays) {
        return {
          shouldNotify: false,
          notificationType: null,
          reason: {
            key: 'notification.checker.recentNotification',
            params: { days: cooldownDays, daysAgo: daysSinceLastNotification },
          },
          rankDropResult: {} as RankDropResult,
          settings: {
            drop_threshold: effectiveSettings.drop_threshold,
            keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
            comparison_days: effectiveSettings.comparison_days,
            consecutive_drop_days: effectiveSettings.consecutive_drop_days,
            min_impressions: effectiveSettings.min_impressions,
            notification_cooldown_days: effectiveSettings.notification_cooldown_days,
          },
        };
      }
    }

    // 順位下落を検知（設定値を使用）
    const rankDropResult = await this.detector.detectRankDrop(
      siteUrl,
      pageUrl,
      effectiveSettings.comparison_days || DEFAULT_ALERT_SETTINGS.comparison_days,
      effectiveSettings.drop_threshold || DEFAULT_ALERT_SETTINGS.position_drop_threshold,
      effectiveSettings.keyword_drop_threshold || DEFAULT_ALERT_SETTINGS.keyword_drop_threshold
    );

    // 連続下落日数のチェック
    const consecutiveDropDays = effectiveSettings.consecutive_drop_days || DEFAULT_ALERT_SETTINGS.consecutive_drop_days;
    const hasConsecutiveDrop = await this.checkConsecutiveDrop(
      siteUrl,
      pageUrl,
      consecutiveDropDays,
      effectiveSettings.drop_threshold || DEFAULT_ALERT_SETTINGS.position_drop_threshold
    );

    if (!hasConsecutiveDrop) {
      return {
        shouldNotify: false,
        notificationType: null,
        reason: {
          key: 'notification.checker.noConsecutiveDrop',
          params: { days: consecutiveDropDays },
        },
        rankDropResult,
        settings: {
          drop_threshold: effectiveSettings.drop_threshold,
          keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
          comparison_days: effectiveSettings.comparison_days,
          consecutive_drop_days: effectiveSettings.consecutive_drop_days,
          min_impressions: effectiveSettings.min_impressions,
          notification_cooldown_days: effectiveSettings.notification_cooldown_days,
        },
      };
    }

    // インプレッション数の閾値チェック
    const minImpressions = effectiveSettings.min_impressions || DEFAULT_ALERT_SETTINGS.min_impressions;
    const hasValidKeywords = rankDropResult.droppedKeywords.some(
      (kw) => kw.impressions >= minImpressions
    );

    if (!hasValidKeywords && rankDropResult.droppedKeywords.length > 0) {
      return {
        shouldNotify: false,
        notificationType: null,
        reason: {
          key: 'notification.checker.noValidKeywords',
          params: { min: minImpressions },
        },
        rankDropResult,
        settings: {
          drop_threshold: effectiveSettings.drop_threshold,
          keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
          comparison_days: effectiveSettings.comparison_days,
          consecutive_drop_days: effectiveSettings.consecutive_drop_days,
          min_impressions: effectiveSettings.min_impressions,
          notification_cooldown_days: effectiveSettings.notification_cooldown_days,
        },
      };
    }

    // 順位下落の条件を満たしている場合、順位上昇もチェック
    // 順位上昇の閾値は順位下落と同じ設定を使用
    const riseThreshold = effectiveSettings.drop_threshold || DEFAULT_ALERT_SETTINGS.position_drop_threshold;
    const rankRiseResult = await this.detector.detectRankRise(
      siteUrl,
      pageUrl,
      effectiveSettings.comparison_days || DEFAULT_ALERT_SETTINGS.comparison_days,
      riseThreshold
    );

    // 順位上昇が検知された場合は、順位上昇を優先（順位下落より良いニュース）
    // riseAmountが負の値（順位が下がっている）場合は、hasRiseをfalseにする
    if (rankRiseResult.hasRise && rankRiseResult.riseAmount > 0) {
      return {
        shouldNotify: true,
        notificationType: 'rank_rise',
        reason: {
          key: 'notification.checker.rankRiseDetected',
          params: {
            from: rankRiseResult.baseAveragePosition.toFixed(1),
            to: rankRiseResult.currentAveragePosition.toFixed(1),
            rise: rankRiseResult.riseAmount.toFixed(1),
          },
        },
        rankDropResult: {} as RankDropResult,
        rankRiseResult,
        settings: {
          drop_threshold: effectiveSettings.drop_threshold,
          keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
          comparison_days: effectiveSettings.comparison_days,
          consecutive_drop_days: effectiveSettings.consecutive_drop_days,
          min_impressions: effectiveSettings.min_impressions,
          notification_cooldown_days: effectiveSettings.notification_cooldown_days,
        },
      };
    }

    // 順位下落の通知
    return {
      shouldNotify: true,
      notificationType: 'rank_drop',
      reason: {
        key: 'notification.checker.rankDropDetected',
        params: {
          from: rankDropResult.baseAveragePosition.toFixed(1),
          to: rankDropResult.currentAveragePosition.toFixed(1),
          drop: rankDropResult.dropAmount.toFixed(1),
        },
      },
      rankDropResult,
      settings: {
        drop_threshold: effectiveSettings.drop_threshold,
        keyword_drop_threshold: effectiveSettings.keyword_drop_threshold,
        comparison_days: effectiveSettings.comparison_days,
        consecutive_drop_days: effectiveSettings.consecutive_drop_days,
        min_impressions: effectiveSettings.min_impressions,
        notification_cooldown_days: effectiveSettings.notification_cooldown_days,
      },
    };
  }

  /**
   * 連続下落日数をチェック
   */
  private async checkConsecutiveDrop(
    siteUrl: string,
    pageUrl: string,
    consecutiveDays: number,
    dropThreshold: number
  ): Promise<boolean> {
    const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startDate = new Date(
      Date.now() - (consecutiveDays + 5) * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0];

    // 時系列データを取得
    const timeSeriesData = await this.client.getPageTimeSeriesData(
      siteUrl,
      pageUrl,
      startDate,
      endDate
    );

    const rows = Array.isArray(timeSeriesData?.rows) ? timeSeriesData.rows : [];
    if (rows.length < consecutiveDays) {
      return false;
    }

    // 直近N日間のデータを取得
    const recentRows = rows.slice(-consecutiveDays);
    
    // 各日の順位を計算
    const dailyPositions = recentRows.map((row) => row.position);
    
    // 連続して下落しているかチェック
    // 基準となる順位（最初の日の順位）と比較
    if (dailyPositions.length < consecutiveDays) {
      return false;
    }

    const basePosition = dailyPositions[0];
    let consecutiveDropCount = 0;

    for (let i = 1; i < dailyPositions.length; i++) {
      const currentPosition = dailyPositions[i];
      if (currentPosition > basePosition + dropThreshold) {
        consecutiveDropCount++;
      } else {
        consecutiveDropCount = 0;
      }
    }

    return consecutiveDropCount >= consecutiveDays - 1;
  }
}

