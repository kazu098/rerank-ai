import { NextRequest, NextResponse } from "next/server";
import { getSlackOAuthUrl } from "@/lib/slack-oauth";
import { routing } from "@/src/i18n/routing";

// 動的ルートとして明示（request.urlを使用するため）
export const dynamic = 'force-dynamic';

/**
 * refererからロケールを抽出
 */
function getLocaleFromReferer(request: NextRequest): string {
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const pathSegments = refererUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0 && routing.locales.includes(pathSegments[0] as any)) {
        return pathSegments[0];
      }
    } catch (e) {
      // URL解析に失敗した場合はデフォルトを使用
    }
  }
  return routing.defaultLocale;
}

/**
 * Slack OAuth認証開始
 * GET /api/auth/slack/authorize?state=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state") || "";
    
    // リクエストURLから直接ホストを取得（www付き/なしの両方に対応）
    const requestUrl = new URL(request.url);
    const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
    console.log("[Slack OAuth] Authorization request:", {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      url: request.url,
      host: requestUrl.host,
      protocol: requestUrl.protocol,
      requestOrigin,
    });

    const oauthUrl = getSlackOAuthUrl(state, requestOrigin);
    console.log("[Slack OAuth] Generated OAuth URL:", oauthUrl.substring(0, 200) + "...");

    return NextResponse.redirect(oauthUrl);
  } catch (error: any) {
    console.error("[Slack OAuth] Authorization error:", error);
    const locale = getLocaleFromReferer(request);
    return NextResponse.redirect(
      new URL(`/${locale}/dashboard/notifications?error=slack_oauth_error&message=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}

