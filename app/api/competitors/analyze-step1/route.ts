import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeStep1 } from "@/lib/competitor-analysis-step1";
import { checkUserPlanLimit, isTrialActive } from "@/lib/billing/plan-limits";
import { getArticleByUrl } from "@/lib/db/articles";
import { getUserById } from "@/lib/db/users";
import { getPlanById } from "@/lib/db/plans";

/**
 * Step 1: GSCデータ取得 + キーワード選定 + 時系列データ取得
 * POST /api/competitors/analyze-step1
 * Body: { siteUrl: string, pageUrl: string, maxKeywords?: number }
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // ユーザーとプラン情報を取得
    const user = await getUserById(session.userId);
    if (!user || !user.plan_id) {
      return NextResponse.json(
        { 
          error: "errors.planNotSet",
          errorKey: "errors.planNotSet",
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    const plan = await getPlanById(user.plan_id);
    if (!plan) {
      return NextResponse.json(
        { 
          error: "errors.planNotFound",
          errorKey: "errors.planNotFound",
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    // スターターのトライアルの場合：トライアル期間をチェック
    const isTrial = await isTrialActive(session.userId);
    if (plan.name === "starter" && !isTrial) {
      // スターターのトライアル期間が終了している場合
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

    // その他のプランの場合：分析回数の制限をチェック
    const limitCheck = await checkUserPlanLimit(session.userId, "analyses");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { 
          error: limitCheck.reason || "errors.analysesLimitExceeded",
          errorKey: limitCheck.reason || "errors.analysesLimitExceeded",
          limitExceeded: true,
          limitType: "analyses",
          currentUsage: limitCheck.currentUsage,
          limit: limitCheck.limit,
          upgradeRequired: true
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      maxKeywords = 3,
      selectedKeywords, // 手動選択されたキーワード（オプション）
    } = body;

    if (!siteUrl || !pageUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl" },
        { status: 400 }
      );
    }

    const apiStartTime = Date.now();
    console.log(
      `[API] ⏱️ Step 1 starting for ${siteUrl}${pageUrl}, maxKeywords: ${maxKeywords} at ${new Date().toISOString()}`
    );

    // 記事のタイトルを取得（キーワード選定の関連性スコアに使用）
    let articleTitle: string | null = null;
    try {
      const fullUrl = `${siteUrl}${pageUrl}`;
      const article = await getArticleByUrl(session.userId, fullUrl);
      articleTitle = article?.title || null;
      if (articleTitle) {
        console.log(`[API] Article title found: ${articleTitle}`);
      }
    } catch (error) {
      console.warn(`[API] Failed to get article title: ${error}`);
      // 記事タイトルの取得に失敗しても分析は続行
    }

    const result = await analyzeStep1(siteUrl, pageUrl, maxKeywords, articleTitle, selectedKeywords);

    const apiTotalTime = Date.now() - apiStartTime;
    console.log(
      `[API] ⏱️ Step 1 complete: ${apiTotalTime}ms (${(apiTotalTime / 1000).toFixed(2)}s)`
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in Step 1:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze step 1" },
      { status: 500 }
    );
  }
}


