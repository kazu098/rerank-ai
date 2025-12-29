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

    // Slack設定を取得（通知設定ページで設定された値をそのまま使用）
    // channel='slack'かつarticle_id IS NULLの設定を直接DBから取得
    const { createSupabaseClient } = await import("@/lib/supabase");
    const supabase = createSupabaseClient();
    const { data: slackSettingsData, error: slackSettingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', session.userId)
      .is('article_id', null)
      .eq('channel', 'slack')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    let slackSettings = null;
    if (!slackSettingsError && slackSettingsData && slackSettingsData.slack_bot_token) {
      slackSettings = slackSettingsData as any;
      console.log("[Article Notification API] Found Slack settings:", {
        hasBotToken: !!slackSettings.slack_bot_token,
        notificationType: slackSettings.slack_notification_type,
        channelId: slackSettings.slack_channel_id,
        userId: slackSettings.slack_user_id,
      });
    } else {
      console.log("[Article Notification API] No Slack settings found:", {
        error: slackSettingsError?.message,
        hasData: !!slackSettingsData,
        hasBotToken: slackSettingsData?.slack_bot_token ? true : false,
      });
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
        },
        articleId
      );
    } else if (channel === 'slack') {
      // Slack設定の場合は、デフォルト設定からSlack情報を継承
      // slackSettingsを使用（is_enabledに関わらずSlack連携の有無を確認）
      if (!slackSettings?.slack_bot_token) {
        return NextResponse.json(
          { error: "Slack is not connected. Please connect Slack in notification settings first." },
          { status: 400 }
        );
      }

      // 通知先が選択されていない場合はエラー
      if (!slackSettings.slack_notification_type) {
        return NextResponse.json(
          { error: "Please select a notification destination (DM or Channel) in notification settings first." },
          { status: 400 }
        );
      }

      // DMの場合はslack_user_idをrecipientとして使用
      // チャネルの場合はslack_channel_idをrecipientとして使用
      let recipient = '';
      if (slackSettings.slack_notification_type === 'dm') {
        // DMの場合はslack_user_idを使用（slack_channel_idはnullでもOK）
        if (!slackSettings.slack_user_id) {
          return NextResponse.json(
            { error: "Slack user ID is missing. Please reconnect Slack in notification settings." },
            { status: 400 }
          );
        }
        recipient = slackSettings.slack_user_id;
      } else if (slackSettings.slack_notification_type === 'channel') {
        // チャネルの場合はslack_channel_idが必須
        if (!slackSettings.slack_channel_id) {
          return NextResponse.json(
            { error: "Please select a Slack channel in notification settings first." },
            { status: 400 }
          );
        }
        recipient = slackSettings.slack_channel_id;
      }

      await saveOrUpdateNotificationSettings(
        session.userId,
        {
          notification_type: 'rank_drop',
          channel: 'slack',
          recipient: recipient,
          is_enabled: enabled,
          // Slack設定はslackSettingsから継承（通知設定ページで設定された値をそのまま使用）
          slack_bot_token: slackSettings.slack_bot_token,
          slack_user_id: slackSettings.slack_user_id,
          slack_team_id: slackSettings.slack_team_id,
          slack_channel_id: slackSettings.slack_channel_id, // DMの場合はnullでもOK
          slack_notification_type: slackSettings.slack_notification_type,
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

