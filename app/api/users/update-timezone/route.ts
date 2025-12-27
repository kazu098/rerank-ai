import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateUserTimezone } from "@/lib/db/users";

/**
 * ユーザーのタイムゾーンを更新
 * POST /api/users/update-timezone
 * Body: { timezone: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { timezone } = body;

    if (!timezone || typeof timezone !== 'string') {
      return NextResponse.json(
        { error: "Missing or invalid timezone parameter" },
        { status: 400 }
      );
    }

    // タイムゾーンの形式を検証（IANA Time Zone Database形式）
    // 例: 'Asia/Tokyo', 'America/New_York', 'Europe/London'
    const timezoneRegex = /^[A-Z][a-z]+\/[A-Z][a-z_]+$/;
    if (!timezoneRegex.test(timezone) && timezone !== 'UTC') {
      return NextResponse.json(
        { error: "Invalid timezone format. Expected IANA timezone (e.g., 'Asia/Tokyo')" },
        { status: 400 }
      );
    }

    await updateUserTimezone(session.user.id, timezone);

    return NextResponse.json({ success: true, timezone });
  } catch (error: any) {
    console.error("Error updating user timezone:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update timezone" },
      { status: 500 }
    );
  }
}

