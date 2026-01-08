import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateArticle } from "@/lib/db/articles";
import { saveOrUpdateNotificationSettings } from "@/lib/db/notification-settings";
import { getSitesByUserId } from "@/lib/db/sites";
import { updateUserTimezone } from "@/lib/db/users";
import { checkUserPlanLimit, isTrialActive } from "@/lib/billing/plan-limits";
import { getUserById } from "@/lib/db/users";
import { getPlanById } from "@/lib/db/plans";

/**
 * 記事の監視を開始
 * POST /api/articles/start-monitoring
 * Body: { 
 *   url: string,
 *   siteUrl: string,
 *   email: string,
 *   notificationTime?: string (HH:MM形式),
 *   timezone?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, siteUrl, email, notificationTime, timezone } = body;

    if (!url || !siteUrl || !email) {
      return NextResponse.json(
        { error: "Missing required parameters: url, siteUrl, email" },
        { status: 400 }
      );
    }

    // ユーザーとプラン情報を取得
    const user = await getUserById(session.userId);
    if (!user || !user.plan_id) {
      return NextResponse.json(
        { 
          error: "errors.planNotSet",
          errorKey: "errors.planNotSet",
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    const plan = await getPlanById(user.plan_id);
    if (!plan) {
      return NextResponse.json(
        { 
          error: "errors.planNotFound",
          errorKey: "errors.planNotFound",
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    // スターターのトライアルの場合：トライアル期間をチェック
    const isTrial = await isTrialActive(session.userId);
    if (plan.name === "starter" && !isTrial) {
      // スターターのトライアル期間が終了している場合
      return NextResponse.json(
        { 
          error: "errors.trialExpired",
          errorKey: "errors.trialExpired",
          trialExpired: true,
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    // その他のプランの場合：監視記事数の制限をチェック
    const limitCheck = await checkUserPlanLimit(session.userId, "articles");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { 
          error: limitCheck.reason || "errors.articlesLimitExceeded",
          errorKey: limitCheck.reason || "errors.articlesLimitExceeded",
          limitExceeded: true,
          limitType: "articles",
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    // サイト情報を取得
    const sites = await getSitesByUserId(session.userId);
    const site = sites.find((s) => s.site_url === siteUrl);
    if (!site) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
    }

    // タイムゾーンが提供されている場合、ユーザーのタイムゾーンを更新
    if (timezone) {
      try {
        await updateUserTimezone(session.userId, timezone);
      } catch (error: any) {
        console.error("[Monitoring] Failed to update user timezone:", error);
        // タイムゾーンの更新に失敗しても続行
      }
    }

    // 記事を保存または更新（監視対象として設定）
    const article = await saveOrUpdateArticle(
      session.userId,
      url,
      site.id,
      undefined, // titleは後で取得可能
      undefined // keywordsは後で取得可能
    );

    // 通知設定を保存（通知チャネル関連のみ）
    await saveOrUpdateNotificationSettings(
      session.userId,
      {
        notification_type: 'rank_drop',
        channel: 'email',
        recipient: email,
        is_enabled: true,
      },
      article.id
    );

    // 通知時刻とタイムゾーンはuser_alert_settingsに保存（提供されている場合）
    if (notificationTime || timezone) {
      const { saveOrUpdateUserAlertSettings } = await import("@/lib/db/alert-settings");
      const notificationTimeValue = notificationTime ? (notificationTime.includes(':') && notificationTime.split(':').length === 2 ? notificationTime + ':00' : notificationTime) : undefined;
      const effectiveTimezone = timezone || undefined;
      
      await saveOrUpdateUserAlertSettings(session.userId, {
        notification_time: notificationTimeValue,
        timezone: effectiveTimezone,
      });
    }

    return NextResponse.json({ 
      success: true, 
      articleId: article.id,
      message: "Monitoring started successfully"
    });
  } catch (error: any) {
    console.error("Error starting monitoring:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start monitoring" },
      { status: 500 }
    );
  }
}

