import { NextRequest, NextResponse } from "next/server";
import { getSlackOAuthUrl } from "@/lib/slack-oauth";

// 動的ルートとして明示（request.urlを使用するため）
export const dynamic = 'force-dynamic';

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
    return NextResponse.redirect(
      new URL(`/dashboard/notifications?error=slack_oauth_error&message=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}

