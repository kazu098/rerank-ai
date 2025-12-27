import { GSCApiClient } from "./gsc-api";
import { RankDropDetector, RankDropResult } from "./rank-drop-detection";
import { getNotificationSettings, DEFAULT_NOTIFICATION_SETTINGS } from "./db/notification-settings";
import { getArticleById } from "./db/articles";
import { createSupabaseClient } from "./supabase";

export interface NotificationCheckResult {
  shouldNotify: boolean;
  reason: {
    key: string;
    params?: Record<string, string | number>;
  };
  rankDropResult: RankDropResult;
  settings: {
    drop_threshold: number;
    keyword_drop_threshold: number;
    comparison_days: number;
    consecutive_drop_days: number;
    min_impressions: number;
    notification_cooldown_days: number;
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

    // 通知設定を取得（記事固有の設定があればそれを使用、なければデフォルト）
    const settings = await getNotificationSettings(userId, articleId);
    const effectiveSettings = settings || {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      user_id: userId,
      article_id: articleId,
    } as any;

    // 修正済みフラグが立っている場合は通知しない
    if (article.is_fixed) {
      const fixedAt = article.fixed_at ? new Date(article.fixed_at) : null;
      const cooldownDays = effectiveSettings.notification_cooldown_days || DEFAULT_NOTIFICATION_SETTINGS.notification_cooldown_days;
      
      if (fixedAt) {
        const daysSinceFixed = Math.floor(
          (Date.now() - fixedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceFixed < cooldownDays) {
          return {
            shouldNotify: false,
            reason: {
              key: 'notification.checker.fixedArticle',
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
    const cooldownDays = effectiveSettings.notification_cooldown_days || DEFAULT_NOTIFICATION_SETTINGS.notification_cooldown_days;
    if (article.last_notification_sent_at) {
      const lastSent = new Date(article.last_notification_sent_at);
      const daysSinceLastNotification = Math.floor(
        (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastNotification < cooldownDays) {
        return {
          shouldNotify: false,
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
      effectiveSettings.comparison_days || DEFAULT_NOTIFICATION_SETTINGS.comparison_days,
      effectiveSettings.drop_threshold || DEFAULT_NOTIFICATION_SETTINGS.drop_threshold,
      effectiveSettings.keyword_drop_threshold || DEFAULT_NOTIFICATION_SETTINGS.keyword_drop_threshold
    );

    // 連続下落日数のチェック
    const consecutiveDropDays = effectiveSettings.consecutive_drop_days || DEFAULT_NOTIFICATION_SETTINGS.consecutive_drop_days;
    const hasConsecutiveDrop = await this.checkConsecutiveDrop(
      siteUrl,
      pageUrl,
      consecutiveDropDays,
      effectiveSettings.drop_threshold || DEFAULT_NOTIFICATION_SETTINGS.drop_threshold
    );

    if (!hasConsecutiveDrop) {
      return {
        shouldNotify: false,
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
    const minImpressions = effectiveSettings.min_impressions || DEFAULT_NOTIFICATION_SETTINGS.min_impressions;
    const hasValidKeywords = rankDropResult.droppedKeywords.some(
      (kw) => kw.impressions >= minImpressions
    );

    if (!hasValidKeywords && rankDropResult.droppedKeywords.length > 0) {
      return {
        shouldNotify: false,
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

    // 通知が必要な条件を満たしている
    return {
      shouldNotify: true,
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

