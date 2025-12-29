import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exchangeSlackCodeForToken, getSlackUserId } from "@/lib/slack-oauth";
import { saveOrUpdateNotificationSettings } from "@/lib/db/notification-settings";
import { routing } from "@/src/i18n/routing";
import { getUserById } from "@/lib/db/users";

// 動的ルートとして明示（request.urlを使用するため）
export const dynamic = 'force-dynamic';

/**
 * ロケールを取得（referer、セッション、デフォルトの順で試行）
 */
async function getLocale(request: NextRequest, sessionUserId?: string): Promise<string> {
  // 1. refererヘッダーからロケールを抽出
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const pathSegments = refererUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0 && routing.locales.includes(pathSegments[0] as any)) {
        return pathSegments[0];
      }
    } catch (e) {
      // URL解析に失敗した場合は次の方法を試す
    }
  }

  // 2. セッションからユーザー情報を取得してロケールを取得
  if (sessionUserId) {
    try {
      const user = await getUserById(sessionUserId);
      if (user?.locale && routing.locales.includes(user.locale as any)) {
        return user.locale;
      }
    } catch (e) {
      console.error("[Slack OAuth] Failed to get user locale:", e);
    }
  }

  // 3. デフォルトロケールを使用
  return routing.defaultLocale;
}

/**
 * Slack OAuth認証コールバック
 * GET /api/auth/slack/callback?code=xxx&state=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    
    // デバッグログ
    const requestUrl = new URL(request.url);
    console.log("[Slack OAuth] Callback received:", {
      fullUrl: request.url,
      origin: requestUrl.origin,
      hostname: requestUrl.hostname,
      code: code ? "present" : "missing",
      codeLength: code?.length,
      state,
      error,
      headers: {
        host: request.headers.get('host'),
        referer: request.headers.get('referer'),
      },
    });

    // セッションを取得（早期に取得してロケール判定に使用）
    const session = await auth();
    const locale = await getLocale(request, session?.userId as string | undefined);

    // リダイレクト先URLを生成（新しいタブで開いた場合の処理を含む）
    const getRedirectHtml = (success: boolean, message?: string, error?: string) => {
      const redirectUrl = success
        ? new URL(`/${locale}/dashboard/settings?slack_connected=true`, request.url)
        : new URL(`/${locale}/dashboard/settings?error=slack_oauth_error&message=${encodeURIComponent(error || message || "Unknown error")}`, request.url);
      
      return `<!DOCTYPE html>
<html>
<head>
  <title>${success ? "Slack連携完了" : "Slack連携エラー"}</title>
</head>
<body>
  <script>
    (function() {
      // Chrome拡張機能によるエラーを抑制
      const originalConsoleError = console.error;
      console.error = function(...args) {
        // Chrome拡張機能関連のエラーは無視
        const message = args.join(' ');
        if (message.includes('message port closed') || 
            message.includes('content.js') || 
            message.includes('multi-tabs.js')) {
          return; // エラーを無視
        }
        originalConsoleError.apply(console, args);
      };
      
      try {
        // 親ウィンドウにメッセージを送信してリロード
        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage({ 
              type: 'slack_connected', 
              success: ${success},
              ${error ? `error: '${error.replace(/'/g, "\\'")}',` : ''}
            }, '*');
            // メッセージ送信後、少し待ってからウィンドウを閉じる
            setTimeout(function() {
              try {
                window.close();
              } catch (closeError) {
                // ウィンドウを閉じられない場合（ポップアップブロッカーなど）、リダイレクト
                window.location.href = '${redirectUrl.toString()}';
              }
            }, 100);
          } catch (e) {
            // postMessageが失敗した場合、通常のリダイレクトにフォールバック
            // Chrome拡張機能によるエラーは無視
            if (!e.message || (!e.message.includes('message port') && !e.message.includes('port closed'))) {
              console.error('Failed to send message to parent:', e);
            }
            window.location.href = '${redirectUrl.toString()}';
          }
        } else {
          // 親ウィンドウがない、または既に閉じられている場合
          window.location.href = '${redirectUrl.toString()}';
        }
      } catch (e) {
        // エラーが発生した場合、通常のリダイレクトにフォールバック
        // Chrome拡張機能によるエラーは無視
        if (!e.message || (!e.message.includes('message port') && !e.message.includes('port closed'))) {
          console.error('Error in callback handler:', e);
        }
        window.location.href = '${redirectUrl.toString()}';
      }
      
      // タイムアウト: 5秒後に自動的にリダイレクト（フォールバック）
      setTimeout(function() {
        if (!document.hidden) {
          window.location.href = '${redirectUrl.toString()}';
        }
      }, 5000);
    })();
  </script>
  <p>${success ? "Slack連携が完了しました。このウィンドウは自動的に閉じられます。" : `エラーが発生しました: ${error || message}。このウィンドウは自動的に閉じられます。`}</p>
  <p><a href="${redirectUrl.toString()}">ここをクリック</a>して続行してください。</p>
</body>
</html>`;
    };

    if (error) {
      console.error("[Slack OAuth] Error:", error);
      return new NextResponse(getRedirectHtml(false, undefined, error), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    if (!code) {
      return new NextResponse(getRedirectHtml(false, undefined, "認証コードが取得できませんでした"), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    // セッションが取得できているか確認（ユーザーがログインしている必要がある）
    if (!session?.userId) {
      return new NextResponse(getRedirectHtml(false, undefined, "認証が必要です"), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    // 認証コードをトークンに交換（リクエストURLを渡して、実際のホストを使用）
    console.log("[Slack OAuth] Exchanging code for token, request URL:", request.url);
    let tokens;
    try {
      tokens = await exchangeSlackCodeForToken(code, request.url);
      console.log("[Slack OAuth] Token exchange successful, teamId:", tokens.teamId);
    } catch (tokenError: any) {
      console.error("[Slack OAuth] Token exchange failed:", {
        error: tokenError.message,
        stack: tokenError.stack,
        requestUrl: request.url,
      });
      return new NextResponse(getRedirectHtml(false, undefined, `トークン交換に失敗しました: ${tokenError.message}`), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    // ユーザーIDを取得（必要に応じて）
    console.log("[Slack OAuth] Getting Slack user ID...");
    let slackUserId: string | null = null;
    try {
      slackUserId = await getSlackUserId(tokens.botToken);
      console.log("[Slack OAuth] Slack user ID obtained:", slackUserId || "null");
    } catch (userIdError: any) {
      console.error("[Slack OAuth] Failed to get Slack user ID (continuing anyway):", {
        error: userIdError.message,
        stack: userIdError.stack,
      });
      // ユーザーID取得の失敗は通知設定保存を妨げない
    }

    // Slack連携情報を保存（slack_integrationsテーブルに保存）
    console.log("[Slack OAuth] Saving Slack integration...", {
      userId: session.userId,
      slackUserId: tokens.userId || slackUserId,
      teamId: tokens.teamId,
      hasBotToken: !!tokens.botToken,
    });

    try {
      const { saveOrUpdateSlackIntegration } = await import("@/lib/db/slack-integrations");
      await saveOrUpdateSlackIntegration(
        session.userId,
        {
          slack_bot_token: tokens.botToken,
          slack_user_id: tokens.userId || slackUserId,
          slack_team_id: tokens.teamId,
          slack_channel_id: null, // 連携後は未選択状態にして、ユーザーに選択を促す
          slack_notification_type: null, // 連携後は未選択状態にして、ユーザーに選択を促す
        }
      );
      console.log("[Slack OAuth] Slack integration saved successfully");
    } catch (saveError: any) {
      console.error("[Slack OAuth] Failed to save Slack integration:", {
        error: saveError.message,
        stack: saveError.stack,
        userId: session.userId,
      });
      throw saveError; // エラーを再スローしてcatchブロックで処理
    }

    // 成功時のリダイレクト
    return new NextResponse(getRedirectHtml(true), {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error("[Slack OAuth] Callback error:", {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      details: (error as any).details,
    });
    // エラー時もロケールを取得を試みる
    const session = await auth().catch(() => null);
    const locale = await getLocale(request, session?.userId as string | undefined).catch(() => routing.defaultLocale);
    const errorMessage = error.message || "Unknown error";
    const errorRedirectUrl = new URL(`/${locale}/dashboard/settings?error=slack_oauth_error&message=${encodeURIComponent(errorMessage)}`, request.url);
    console.error("[Slack OAuth] Redirecting to error URL:", errorRedirectUrl.toString());
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Slack連携エラー</title>
</head>
<body>
  <script>
    if (window.opener) {
      window.opener.postMessage({ 
        type: 'slack_connected', 
        success: false, 
        error: '${error.message.replace(/'/g, "\\'")}' 
      }, '*');
      window.close();
    } else {
      window.location.href = '${errorRedirectUrl.toString()}';
    }
  </script>
  <p>エラーが発生しました: ${error.message}。このウィンドウは自動的に閉じられます。</p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  }
}
