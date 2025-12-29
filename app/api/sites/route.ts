import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSitesByUserId } from "@/lib/db/sites";

/**
 * ユーザーのサイト一覧を取得
 * GET /api/sites
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const userId = session.userId as string;
    const sites = await getSitesByUserId(userId);

    return NextResponse.json(sites);
  } catch (error: any) {
    console.error("Error getting sites:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get sites" },
      { status: 500 }
    );
  }
}

