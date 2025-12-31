import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { saveOrUpdateSite, getSitesByUserId } from "@/lib/db/sites";
import { checkUserPlanLimit, isTrialActive } from "@/lib/billing/plan-limits";

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

    // 既存のサイトを確認（更新の場合は制限チェックをスキップ）
    const existingSites = await getSitesByUserId(session.userId);
    const isUpdate = existingSites.some(s => s.site_url === siteUrl);

    // 新規追加の場合のみ制限チェック
    if (!isUpdate) {
      // プラン制限をチェック（サイト数）
      const limitCheck = await checkUserPlanLimit(session.userId, "sites");
      if (!limitCheck.allowed) {
        return NextResponse.json(
          { 
            error: limitCheck.reason || "errors.sitesLimitExceeded",
            errorKey: limitCheck.reason || "errors.sitesLimitExceeded",
            limitExceeded: true,
            limitType: "sites",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            upgradeRequired: true
          },
          { status: 403 }
        );
      }

      // トライアル期間のチェック
      const isTrial = await isTrialActive(session.userId);
      if (!isTrial && !limitCheck.allowed) {
        return NextResponse.json(
          { 
            error: "errors.trialExpired",
            errorKey: "errors.trialExpired",
            trialExpired: true,
            upgradeRequired: true
          },
          { status: 403 }
        );
      }
    }

    // JWTトークンからリフレッシュトークンを取得
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });

    const refreshToken = (token?.refreshToken as string) || "";

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

