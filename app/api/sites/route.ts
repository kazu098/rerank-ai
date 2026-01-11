import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSitesByUserId } from "@/lib/db/sites";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * ユーザーのサイト一覧を取得
 * GET /api/sites
 */
export async function GET(request: NextRequest) {
  try {
    const { session, locale } = await getSessionAndLocale(request);
    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
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

