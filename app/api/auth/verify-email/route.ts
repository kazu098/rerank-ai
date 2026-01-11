import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/db/users";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * メール認証
 * GET /api/auth/verify-email?token=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { locale } = await getSessionAndLocale(request);
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.tokenNotProvided") },
        { status: 400 }
      );
    }

    const user = await verifyEmailToken(token);

    if (!user) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.invalidOrExpiredToken") },
        { status: 400 }
      );
    }

    // 認証成功ページにリダイレクト
    return NextResponse.redirect(
      new URL("/auth/verify-email/success", request.url)
    );
  } catch (error: any) {
    console.error("[Auth] Email verification error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      {
        error: error.message || getErrorMessage(locale, "errors.emailVerificationFailed"),
      },
      { status: 500 }
    );
  }
}

