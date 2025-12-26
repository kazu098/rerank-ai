import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

    // トークンの有効期限を計算（1時間後、実際の有効期限はGSC APIから取得する必要がある）
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // 注意: refreshTokenはNextAuth.jsのセッションから直接取得できないため、
    // 一時的に空文字列を保存。実際の運用では、JWTトークンから取得するか、
    // 別途データベースに保存する必要がある
    // TODO: refreshTokenの取得方法を改善する
    const refreshToken = "";

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

