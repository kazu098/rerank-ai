import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// お問い合わせフォームのリクエストボディ
interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  locale?: string;
  files?: Array<{
    url: string;
    name: string;
    type: string;
    size: number;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: ContactFormData = await request.json();
    const { name, email, subject, message, locale = 'ja', files = [] } = body;

    // バリデーション
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: locale === 'ja' ? "必須項目を入力してください" : "Please fill in all required fields" },
        { status: 400 }
      );
    }

    // メールアドレスの形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: locale === 'ja' ? "有効なメールアドレスを入力してください" : "Please enter a valid email address" },
        { status: 400 }
      );
    }

    // メッセージの長さチェック
    if (message.length > 5000) {
      return NextResponse.json(
        { error: locale === 'ja' ? "メッセージは5000文字以内で入力してください" : "Message must be 5000 characters or less" },
        { status: 400 }
      );
    }

    // Resend APIキーのチェック
    if (!process.env.RESEND_API_KEY) {
      console.error("[Contact API] RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: locale === 'ja' ? "メール送信設定に問題があります" : "Email configuration error" },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    // サポートチームへのメール送信
    const supportEmail = process.env.SUPPORT_EMAIL || "support@rerank-ai.com";
    const fromEmail = process.env.RESEND_FROM_EMAIL || "ReRank AI <noreply@rerank-ai.com>";

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: supportEmail,
      replyTo: email,
      subject: `[お問い合わせ] ${subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #4F46E5; padding-bottom: 10px;">
            新しいお問い合わせ
          </h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
              <td style="padding: 10px; background-color: #f5f5f5; font-weight: bold; width: 120px;">
                お名前
              </td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">
                ${escapeHtml(name)}
              </td>
            </tr>
            <tr>
              <td style="padding: 10px; background-color: #f5f5f5; font-weight: bold;">
                メールアドレス
              </td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">
                <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px; background-color: #f5f5f5; font-weight: bold;">
                件名
              </td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">
                ${escapeHtml(subject)}
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 20px;">
            <h3 style="color: #333; margin-bottom: 10px;">メッセージ</h3>
            <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
${escapeHtml(message)}
            </div>
          </div>
          
          ${files.length > 0 ? `
          <div style="margin-top: 20px;">
            <h3 style="color: #333; margin-bottom: 10px;">添付ファイル (${files.length}件)</h3>
            <ul style="list-style: none; padding: 0;">
              ${files.map((file) => `
                <li style="margin-bottom: 8px;">
                  <a href="${escapeHtml(file.url)}" style="color: #4F46E5; text-decoration: none; display: inline-flex; align-items: center;">
                    <span style="margin-right: 8px;">📎</span>
                    ${escapeHtml(file.name)}
                    <span style="color: #666; margin-left: 8px; font-size: 12px;">(${formatFileSize(file.size)})</span>
                  </a>
                </li>
              `).join('')}
            </ul>
          </div>
          ` : ''}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
            <p>このメールは ReRank AI のお問い合わせフォームから送信されました。</p>
            <p>返信は「返信」ボタンで直接 ${escapeHtml(email)} に送信できます。</p>
          </div>
        </div>
      `,
      text: `
新しいお問い合わせ

お名前: ${name}
メールアドレス: ${email}
件名: ${subject}

メッセージ:
${message}

${files.length > 0 ? `\n添付ファイル (${files.length}件):\n${files.map((file) => `- ${file.name} (${formatFileSize(file.size)}): ${file.url}`).join('\n')}\n` : ''}
---
このメールは ReRank AI のお問い合わせフォームから送信されました。
返信は直接 ${email} に送信してください。
      `,
    });

    if (error) {
      console.error("[Contact API] Failed to send email:", error);
      return NextResponse.json(
        { error: locale === 'ja' ? "メール送信に失敗しました。しばらく経ってから再度お試しください。" : "Failed to send email. Please try again later." },
        { status: 500 }
      );
    }

    console.log("[Contact API] Email sent successfully:", data);

    // 送信者への自動返信（オプション）
    try {
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: locale === 'ja' 
          ? "【ReRank AI】お問い合わせを受け付けました" 
          : "[ReRank AI] We received your inquiry",
        html: locale === 'ja' 
          ? `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">お問い合わせありがとうございます</h2>
              <p>${escapeHtml(name)} 様</p>
              <p>ReRank AI をご利用いただきありがとうございます。</p>
              <p>以下の内容でお問い合わせを受け付けました。</p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>件名:</strong> ${escapeHtml(subject)}</p>
                <p><strong>メッセージ:</strong></p>
                <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
                ${files.length > 0 ? `
                <p style="margin-top: 10px;"><strong>添付ファイル:</strong> ${files.length}件</p>
                ` : ''}
              </div>
              
              <p>内容を確認の上、担当者よりご連絡いたします。</p>
              <p>通常、1〜3営業日以内にご返信いたします。</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
                <p>ReRank AI サポートチーム</p>
                <p><a href="https://rerank-ai.com">https://rerank-ai.com</a></p>
              </div>
            </div>
          `
          : `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Thank you for contacting us</h2>
              <p>Dear ${escapeHtml(name)},</p>
              <p>Thank you for using ReRank AI.</p>
              <p>We have received your inquiry with the following details:</p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
                <p><strong>Message:</strong></p>
                <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
                ${files.length > 0 ? `
                <p style="margin-top: 10px;"><strong>Attachments:</strong> ${files.length} file(s)</p>
                ` : ''}
              </div>
              
              <p>Our team will review your message and get back to you.</p>
              <p>You can expect a response within 1-3 business days.</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
                <p>ReRank AI Support Team</p>
                <p><a href="https://rerank-ai.com">https://rerank-ai.com</a></p>
              </div>
            </div>
          `,
      });
    } catch (autoReplyError) {
      // 自動返信の失敗はログに記録するが、エラーとしては扱わない
      console.warn("[Contact API] Failed to send auto-reply:", autoReplyError);
    }

    return NextResponse.json({
      success: true,
      message: locale === 'ja' 
        ? "お問い合わせを送信しました。確認メールをお送りしました。" 
        : "Your inquiry has been sent. A confirmation email has been sent to you.",
    });
  } catch (error: any) {
    console.error("[Contact API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// HTMLエスケープ関数
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ファイルサイズをフォーマット
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

