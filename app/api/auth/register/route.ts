import { NextRequest, NextResponse } from "next/server";
import { createUserWithPassword } from "@/lib/db/users";
import { sendVerificationEmail } from "@/lib/email-verification";
import { checkRateLimit, getClientIpAddress } from "@/lib/rate-limit";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * ユーザー登録
 * POST /api/auth/register
 * Body: { email: string, password: string, name?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { locale } = await getSessionAndLocale(request);
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.emailAndPasswordRequired") },
        { status: 400 }
      );
    }

    // レート制限をチェック（IPアドレスベース）
    const ipAddress = getClientIpAddress(request);
    if (ipAddress) {
      const rateLimitResult = await checkRateLimit(ipAddress, 'register');
      if (!rateLimitResult.allowed) {
        const resetTime = new Date(rateLimitResult.resetAt).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
        return NextResponse.json(
          { 
            error: getErrorMessage(locale, "errors.registrationRateLimitExceeded", { resetTime }),
          },
          { status: 429 }
        );
      }
    }

    // レート制限をチェック（メールアドレスベース）
    const emailRateLimitResult = await checkRateLimit(email, 'register');
    if (!emailRateLimitResult.allowed) {
      const resetTime = new Date(emailRateLimitResult.resetAt).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
      return NextResponse.json(
        { 
          error: getErrorMessage(locale, "errors.emailRegistrationRateLimitExceeded", { resetTime }),
        },
        { status: 429 }
      );
    }

    // パスワードの強度チェック
    if (password.length < 8) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.passwordMinLength") },
        { status: 400 }
      );
    }

    // ユーザーを作成
    const user = await createUserWithPassword(email, password, name, locale);

    // 認証メールを送信
    try {
      await sendVerificationEmail(user.email, user.email_verification_token!);
    } catch (emailError: any) {
      console.error("[Auth] Failed to send verification email:", emailError);
      // メール送信に失敗してもユーザー作成は成功とする
    }

    return NextResponse.json({
      message: getErrorMessage(locale, "errors.registrationComplete"),
      userId: user.id,
    });
  } catch (error: any) {
    console.error("[Auth] Registration error:", error);
    const { locale: errorLocale } = await getSessionAndLocale(request);
    // エラーメッセージが既に多言語対応されているかチェック
    const errorKey = error.message;
    let errorMessage = error.message;
    
    // 既知のエラーメッセージを多言語対応に変換
    if (errorKey === "このメールアドレスは既に登録されています") {
      errorMessage = getErrorMessage(errorLocale, "errors.emailAlreadyRegistered");
    } else if (errorKey.includes("メール認証が完了していません")) {
      errorMessage = getErrorMessage(errorLocale, "errors.emailNotVerified");
    }
    
    return NextResponse.json(
      {
        error: errorMessage || getErrorMessage(errorLocale, "errors.registrationFailed"),
      },
      { status: 400 }
    );
  }
}

