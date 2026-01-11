import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { getSitesByUserId } from "@/lib/db/sites";
import { saveOrUpdateSite } from "@/lib/db/sites";

/**
 * 既存サイトのリフレッシュトークンを更新
 * POST /api/sites/update-tokens
 * 再認証後に既存サイトのリフレッシュトークンを更新するために使用
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken || !session?.userId) {
      return NextResponse.json(
        { 
          error: "認証が必要です。Googleアカウントでログインしてください。",
          code: "UNAUTHORIZED"
        },
        { status: 401 }
      );
    }

    // セッションからリフレッシュトークンを取得（NextAuth v5ではセッションに含める）
    // フォールバックとしてJWTトークンからも取得を試みる
    let newRefreshToken: string | undefined = (session as any).refreshToken;
    let tokenExpiresAt: number | undefined;
    
    // セッションにリフレッシュトークンがない場合、JWTトークンから取得を試みる
    if (!newRefreshToken) {
      const token = await getToken({
        req: request,
        secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      });
      newRefreshToken = token?.refreshToken as string | undefined;
      tokenExpiresAt = token?.expiresAt as number | undefined;
    }

    if (!newRefreshToken || newRefreshToken.trim() === '') {
      return NextResponse.json(
        { 
          error: "リフレッシュトークンが取得できませんでした。再ログインしてください。",
          code: "NO_REFRESH_TOKEN"
        },
        { status: 400 }
      );
    }

    // 既存のサイト一覧を取得
    const existingSites = await getSitesByUserId(session.userId);

    console.log(`[Sites Update Tokens] Found ${existingSites.length} sites for user ${session.userId}`);
    console.log(`[Sites Update Tokens] Token info:`, {
      hasAccessToken: !!session.accessToken,
      accessTokenPrefix: session.accessToken ? `${session.accessToken.substring(0, 20)}...` : 'null',
      hasRefreshToken: !!newRefreshToken,
      refreshTokenPrefix: newRefreshToken ? `${newRefreshToken.substring(0, 20)}...` : 'null',
      tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt).toISOString() : 'null',
    });

    // リフレッシュトークンがnullまたは空文字列のサイトを更新
    // また、再認証後はすべてのサイトのアクセストークンを更新（403エラー対策）
    const updatedSites = [];
    for (const site of existingSites) {
      // リフレッシュトークンがnull/空文字列の場合、または再認証後のアクセストークン更新のため
      const shouldUpdate = !site.gsc_refresh_token || site.gsc_refresh_token.trim() === '';
      
      if (shouldUpdate) {
        try {
          console.log(`[Sites Update Tokens] Updating site ${site.id} (${site.site_url}):`, {
            reason: !site.gsc_refresh_token || site.gsc_refresh_token.trim() === '' 
              ? 'refresh_token_missing' 
              : 'access_token_update',
            existingRefreshToken: site.gsc_refresh_token ? `${site.gsc_refresh_token.substring(0, 20)}...` : 'null',
          });
          
          const updatedSite = await saveOrUpdateSite(
            session.userId,
            site.site_url,
            session.accessToken,
            newRefreshToken,
            tokenExpiresAt ? new Date(tokenExpiresAt) : new Date(Date.now() + 3600 * 1000),
            site.display_name || undefined
          );
          updatedSites.push({
            id: updatedSite.id,
            site_url: updatedSite.site_url,
            updated: true,
          });
          console.log(`[Sites Update Tokens] Successfully updated refresh token for site ${site.id} (${site.site_url})`);
        } catch (error: any) {
          console.error(`[Sites Update Tokens] Failed to update site ${site.id}:`, error);
        }
      } else {
        // リフレッシュトークンが既に存在する場合でも、アクセストークンを更新（再認証後の403エラー対策）
        try {
          console.log(`[Sites Update Tokens] Updating access token only for site ${site.id} (${site.site_url})`);
          
          // アクセストークンのみを更新（リフレッシュトークンは既存のものを保持）
          const updatedSite = await saveOrUpdateSite(
            session.userId,
            site.site_url,
            session.accessToken,
            site.gsc_refresh_token, // 既存のリフレッシュトークンを保持
            tokenExpiresAt ? new Date(tokenExpiresAt) : new Date(Date.now() + 3600 * 1000),
            site.display_name || undefined
          );
          updatedSites.push({
            id: updatedSite.id,
            site_url: updatedSite.site_url,
            updated: true,
            accessTokenOnly: true,
          });
          console.log(`[Sites Update Tokens] Successfully updated access token for site ${site.id} (${site.site_url})`);
        } catch (error: any) {
          console.error(`[Sites Update Tokens] Failed to update access token for site ${site.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      message: `${updatedSites.length} site(s) updated`,
      updatedSites,
    });
  } catch (error: any) {
    console.error("[Sites Update Tokens] Error:", error);
    return NextResponse.json(
      { 
        error: error.message || "トークンの更新に失敗しました。",
        code: "INTERNAL_ERROR"
      },
      { status: 500 }
    );
  }
}
