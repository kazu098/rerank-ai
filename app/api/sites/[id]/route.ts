import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSiteById } from "@/lib/db/sites";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * サイト情報を取得
 * GET /api/sites/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequired") },
        { status: 401 }
      );
    }

    const { id } = params;

    // サイト情報を取得
    const site = await getSiteById(id);

    if (!site) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.siteNotFound") },
        { status: 404 }
      );
    }

    // ユーザーが所有しているか確認
    if (site.user_id !== session.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.accessDenied") },
        { status: 403 }
      );
    }

    return NextResponse.json(site);
  } catch (error: any) {
    console.error("[Sites API] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(locale, "errors.siteFetchFailed") },
      { status: 500 }
    );
  }
}
