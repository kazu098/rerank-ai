import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationSettings, saveOrUpdateNotificationSettings } from "@/lib/db/notification-settings";
import { getArticleById } from "@/lib/db/articles";
import { getUserById } from "@/lib/db/users";

/**
 * 記事ごとの通知設定をトグル
 * POST /api/articles/[id]/notification
 * Body: {
 *   channel: 'email' | 'slack',
 *   enabled: boolean
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("[Article Notification API] POST request received");
    const session = await auth();
    if (!session?.userId) {
      console.error("[Article Notification API] Unauthorized: No session or userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const articleId = params.id;
    const body = await request.json();
    const { channel, enabled } = body;

    if (!channel || (channel !== 'email' && channel !== 'slack')) {
      return NextResponse.json(
        { error: "channel must be 'email' or 'slack'" },
        { status: 400 }
      );
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }

    console.log("[Article Notification API] Toggling notification:", {
      userId: session.userId,
      articleId,
      channel,
      enabled,
    });

    // 記事が存在し、ユーザーのものか確認
    const article = await getArticleById(articleId);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    if (article.user_id !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ユーザー情報を取得（recipient取得用）
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 現在の設定を取得
    const currentSettings = await getNotificationSettings(session.userId, articleId);

    // デフォルト設定を取得（メールアドレスやSlack情報取得用）
    const defaultSettings = await getNotificationSettings(session.userId, null);
    
    // Slack連携の確認のため、is_enabledに関わらずSlack設定を取得する
    // getNotificationSettingsはis_enabled=trueのみを返すため、追加で確認が必要
    let slackSettings = defaultSettings;
    if (!defaultSettings?.slack_bot_token && !defaultSettings?.slack_webhook_url) {
      const { createSupabaseClient } = await import("@/lib/supabase");
      const supabase = createSupabaseClient();
      const { data: slackSettingsData, error: slackSettingsError } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', session.userId)
        .is('article_id', null)
        .eq('channel', 'slack')
        .order('updated_at', { ascending: false })
        .limit(1);
      
      // single()ではなくlimit(1)を使用しているため、dataは配列
      if (slackSettingsData && slackSettingsData.length > 0) {
        const slackSetting = slackSettingsData[0];
        if (slackSetting.slack_bot_token || slackSetting.slack_webhook_url) {
          slackSettings = slackSetting as any;
        }
      }
    } else {
      // defaultSettingsにSlack設定がある場合、それを使用
      slackSettings = defaultSettings;
    }

    // 通知設定を保存または更新
    if (channel === 'email') {
      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'email',
          recipient: user.email || '',
          is_enabled: enabled,
          // その他の設定はデフォルト設定または現在の設定から継承
          drop_threshold: currentSettings?.drop_threshold ?? defaultSettings?.drop_threshold,
          keyword_drop_threshold: currentSettings?.keyword_drop_threshold ?? defaultSettings?.keyword_drop_threshold,
          comparison_days: currentSettings?.comparison_days ?? defaultSettings?.comparison_days,
          consecutive_drop_days: currentSettings?.consecutive_drop_days ?? defaultSettings?.consecutive_drop_days,
          min_impressions: currentSettings?.min_impressions ?? defaultSettings?.min_impressions,
          notification_cooldown_days: currentSettings?.notification_cooldown_days ?? defaultSettings?.notification_cooldown_days,
          notification_time: currentSettings?.notification_time ?? defaultSettings?.notification_time,
          timezone: currentSettings?.timezone ?? defaultSettings?.timezone,
        },
        articleId
      );
    } else if (channel === 'slack') {
      // Slack設定の場合は、デフォルト設定からSlack情報を継承
      // slackSettingsを使用（is_enabledに関わらずSlack連携の有無を確認）
      if (!slackSettings?.slack_bot_token && !slackSettings?.slack_webhook_url) {
        return NextResponse.json(
          { error: "Slack is not connected. Please connect Slack in notification settings first." },
          { status: 400 }
        );
      }

      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'slack',
          recipient: slackSettings.recipient || defaultSettings?.recipient || '',
          is_enabled: enabled,
          // Slack設定はslackSettingsから継承（is_enabledに関わらず）
          slack_bot_token: slackSettings.slack_bot_token,
          slack_user_id: slackSettings.slack_user_id,
          slack_team_id: slackSettings.slack_team_id,
          slack_channel_id: slackSettings.slack_channel_id,
          slack_notification_type: slackSettings.slack_notification_type,
          slack_webhook_url: slackSettings.slack_webhook_url,
          // その他の設定もデフォルト設定または現在の設定から継承
          drop_threshold: currentSettings?.drop_threshold ?? (defaultSettings?.drop_threshold ?? slackSettings.drop_threshold),
          keyword_drop_threshold: currentSettings?.keyword_drop_threshold ?? (defaultSettings?.keyword_drop_threshold ?? slackSettings.keyword_drop_threshold),
          comparison_days: currentSettings?.comparison_days ?? (defaultSettings?.comparison_days ?? slackSettings.comparison_days),
          consecutive_drop_days: currentSettings?.consecutive_drop_days ?? (defaultSettings?.consecutive_drop_days ?? slackSettings.consecutive_drop_days),
          min_impressions: currentSettings?.min_impressions ?? (defaultSettings?.min_impressions ?? slackSettings.min_impressions),
          notification_cooldown_days: currentSettings?.notification_cooldown_days ?? (defaultSettings?.notification_cooldown_days ?? slackSettings.notification_cooldown_days),
          notification_time: currentSettings?.notification_time ?? (defaultSettings?.notification_time ?? slackSettings.notification_time),
          timezone: currentSettings?.timezone ?? (defaultSettings?.timezone ?? slackSettings.timezone),
        },
        articleId
      );
    }

    console.log("[Article Notification API] Notification setting updated successfully");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Article Notification API] Error:", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || "Failed to update notification setting" },
      { status: 500 }
    );
  }
}

