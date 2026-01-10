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

    // リフレッシュトークンがnullまたは空文字列のサイトを更新
    const updatedSites = [];
    for (const site of existingSites) {
      if (!site.gsc_refresh_token || site.gsc_refresh_token.trim() === '') {
        try {
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
          console.log(`[Sites Update Tokens] Updated refresh token for site ${site.id} (${site.site_url})`);
        } catch (error: any) {
          console.error(`[Sites Update Tokens] Failed to update site ${site.id}:`, error);
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
