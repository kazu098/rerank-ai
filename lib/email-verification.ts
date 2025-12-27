import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * 認証メールを送信
 */
export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/verify-email?token=${token}`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@rerank-ai.com",
    to: email,
    subject: "【ReRank AI】メールアドレスの認証",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">ReRank AI</h1>
        <p>ご登録ありがとうございます。</p>
        <p>以下のリンクをクリックして、メールアドレスを認証してください：</p>
        <p style="margin: 20px 0;">
          <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            メールアドレスを認証する
          </a>
        </p>
        <p style="color: #666; font-size: 12px;">
          このリンクは24時間有効です。<br>
          もしこのメールに心当たりがない場合は、無視してください。
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          リンクがクリックできない場合は、以下のURLをコピーしてブラウザに貼り付けてください：<br>
          <a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a>
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

