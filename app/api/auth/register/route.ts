import { NextRequest, NextResponse } from "next/server";
import { createUserWithPassword } from "@/lib/db/users";
import { sendVerificationEmail } from "@/lib/email-verification";

/**
 * ユーザー登録
 * POST /api/auth/register
 * Body: { email: string, password: string, name?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードは必須です" },
        { status: 400 }
      );
    }

    // パスワードの強度チェック
    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上である必要があります" },
        { status: 400 }
      );
    }

    // ユーザーを作成
    const user = await createUserWithPassword(email, password, name);

    // 認証メールを送信
    try {
      await sendVerificationEmail(user.email, user.email_verification_token!);
    } catch (emailError: any) {
      console.error("[Auth] Failed to send verification email:", emailError);
      // メール送信に失敗してもユーザー作成は成功とする
    }

    return NextResponse.json({
      message: "ユーザー登録が完了しました。認証メールを確認してください。",
      userId: user.id,
    });
  } catch (error: any) {
    console.error("[Auth] Registration error:", error);
    return NextResponse.json(
      {
        error: error.message || "ユーザー登録に失敗しました",
      },
      { status: 400 }
    );
  }
}

