import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { saveOrUpdateSite } from "@/lib/db/sites";

/**
 * GSC連携情報を保存
 * POST /api/sites/save
 * Body: { siteUrl: string, displayName?: string }
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

    const body = await request.json();
    const { siteUrl, displayName } = body;

    if (!siteUrl) {
      return NextResponse.json(
        { error: "siteUrl is required" },
        { status: 400 }
      );
    }

    // 連携サイト数はプラン制限の対象外（分析回数と監視記事数で実質的に制限される）

    // JWTトークンからリフレッシュトークンを取得
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });

    // 既存のサイトを確認し、リフレッシュトークンが存在する場合は保持する
    const { getSitesByUserId } = await import("@/lib/db/sites");
    const existingSites = await getSitesByUserId(session.userId);
    const existingSite = existingSites.find(s => 
      s.site_url === siteUrl || s.site_url === siteUrl.replace(/\/$/, '')
    );
    
    // JWTから新しいリフレッシュトークンを取得（存在する場合）
    const newRefreshToken = token?.refreshToken as string | undefined;
    // 既存のリフレッシュトークンがある場合は優先して使用、なければ新しいトークンを使用、どちらもなければnull
    const refreshToken: string | null = (existingSite?.gsc_refresh_token && existingSite.gsc_refresh_token.trim() !== '') 
      ? existingSite.gsc_refresh_token 
      : (newRefreshToken && newRefreshToken.trim() !== '' ? newRefreshToken : null);

    // トークンの有効期限を計算（JWTトークンから取得、なければ1時間後）
    const expiresAt = token?.expiresAt
      ? new Date(token.expiresAt as number)
      : new Date(Date.now() + 3600 * 1000);

    // サイト情報を保存
    const site = await saveOrUpdateSite(
      session.userId,
      siteUrl,
      session.accessToken,
      refreshToken,
      expiresAt,
      displayName
    );

    return NextResponse.json({ site });
  } catch (error: any) {
    console.error("[Sites] Error saving site:", error);
    return NextResponse.json(
      { 
        error: error.message || "サイト情報の保存に失敗しました。",
        code: "INTERNAL_ERROR"
      },
      { status: 500 }
    );
  }
}

