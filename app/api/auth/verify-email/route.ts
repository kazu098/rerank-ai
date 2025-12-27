import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/db/users";

/**
 * メール認証
 * GET /api/auth/verify-email?token=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "認証トークンが指定されていません" },
        { status: 400 }
      );
    }

    const user = await verifyEmailToken(token);

    if (!user) {
      return NextResponse.json(
        { error: "無効または期限切れの認証トークンです" },
        { status: 400 }
      );
    }

    // 認証成功ページにリダイレクト
    return NextResponse.redirect(
      new URL("/auth/verify-email/success", request.url)
    );
  } catch (error: any) {
    console.error("[Auth] Email verification error:", error);
    return NextResponse.json(
      {
        error: error.message || "メール認証に失敗しました",
      },
      { status: 500 }
    );
  }
}

