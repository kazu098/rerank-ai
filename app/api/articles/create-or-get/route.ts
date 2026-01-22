import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveOrUpdateArticle, getArticleByUrl } from "@/lib/db/articles";
import { getSitesByUserId, normalizeSiteUrlForComparison } from "@/lib/db/sites";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 記事を作成または取得（分析開始時に呼び出される）
 * POST /api/articles/create-or-get
 * Body: { articleUrl: string, siteUrl: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { session, locale } = await getSessionAndLocale(request);

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequiredWithGoogle") },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { articleUrl, siteUrl } = body;

    if (!articleUrl || !siteUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: articleUrl, siteUrl" },
        { status: 400 }
      );
    }

    // siteUrlからsiteIdを取得
    const sites = await getSitesByUserId(session.userId);
    
    // URLを正規化して比較（共通関数を使用）
    const normalizedSiteUrl = normalizeSiteUrlForComparison(siteUrl);
    const site = sites.find((s) => {
      const normalizedDbUrl = normalizeSiteUrlForComparison(s.site_url);
      return normalizedDbUrl === normalizedSiteUrl;
    });
    
    if (!site) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.siteNotFound") },
        { status: 404 }
      );
    }

    // 記事を取得または作成
    let article = await getArticleByUrl(session.userId, articleUrl);
    
    // 記事が存在しない場合は作成、既存の場合はsite_idを更新
    article = await saveOrUpdateArticle(
      session.userId,
      articleUrl,
      site.id,
      article?.title ?? undefined,
      undefined // keywordsは分析完了後に設定
    );

    if (!article) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.articleCreateOrGetFailed") },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      articleId: article.id,
      article,
    });
  } catch (error: any) {
    console.error("[Article Create or Get] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      {
        error: error.message || getErrorMessage(locale, "errors.articleCreateOrGetFailed"),
      },
      { status: 500 }
    );
  }
}
