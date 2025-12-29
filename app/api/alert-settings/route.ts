import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAlertSettings, saveOrUpdateUserAlertSettings } from "@/lib/db/alert-settings";

/**
 * ユーザーのアラート設定を取得
 * GET /api/alert-settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getUserAlertSettings(session.userId);
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[Alert Settings API] Error fetching settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch alert settings" },
      { status: 500 }
    );
  }
}

/**
 * ユーザーのアラート設定を保存または更新
 * POST /api/alert-settings
 * Body: {
 *   position_drop_threshold?: number,
 *   keyword_drop_threshold?: number,
 *   comparison_days?: number,
 *   notification_frequency?: 'daily' | 'weekly' | 'none'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      position_drop_threshold, 
      keyword_drop_threshold, 
      comparison_days, 
      consecutive_drop_days,
      min_impressions,
      notification_cooldown_days,
      notification_frequency 
    } = body;

    // バリデーション
    if (position_drop_threshold !== undefined && (typeof position_drop_threshold !== 'number' || position_drop_threshold < 0)) {
      return NextResponse.json(
        { error: "position_drop_threshold must be a non-negative number" },
        { status: 400 }
      );
    }

    if (keyword_drop_threshold !== undefined && (typeof keyword_drop_threshold !== 'number' || keyword_drop_threshold < 1)) {
      return NextResponse.json(
        { error: "keyword_drop_threshold must be a positive number" },
        { status: 400 }
      );
    }

    if (comparison_days !== undefined && (typeof comparison_days !== 'number' || comparison_days < 1)) {
      return NextResponse.json(
        { error: "comparison_days must be a positive number" },
        { status: 400 }
      );
    }

    if (notification_frequency !== undefined && !['daily', 'weekly', 'none'].includes(notification_frequency)) {
      return NextResponse.json(
        { error: "notification_frequency must be one of: daily, weekly, none" },
        { status: 400 }
      );
    }

    if (consecutive_drop_days !== undefined && (typeof consecutive_drop_days !== 'number' || consecutive_drop_days < 1)) {
      return NextResponse.json(
        { error: "consecutive_drop_days must be a positive number" },
        { status: 400 }
      );
    }

    if (min_impressions !== undefined && (typeof min_impressions !== 'number' || min_impressions < 1)) {
      return NextResponse.json(
        { error: "min_impressions must be a positive number" },
        { status: 400 }
      );
    }

    if (notification_cooldown_days !== undefined && (typeof notification_cooldown_days !== 'number' || notification_cooldown_days < 0)) {
      return NextResponse.json(
        { error: "notification_cooldown_days must be a non-negative number" },
        { status: 400 }
      );
    }

    const settings = await saveOrUpdateUserAlertSettings(session.userId, {
      position_drop_threshold,
      keyword_drop_threshold,
      comparison_days,
      consecutive_drop_days,
      min_impressions,
      notification_cooldown_days,
      notification_frequency,
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[Alert Settings API] Error saving settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save alert settings" },
      { status: 500 }
    );
  }
}

