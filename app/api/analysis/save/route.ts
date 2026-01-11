import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveAnalysisResult } from "@/lib/db/analysis-results";
import { saveOrUpdateArticle, getArticleByUrl } from "@/lib/db/articles";
import { getSitesByUserId } from "@/lib/db/sites";
import { createSupabaseClient } from "@/lib/supabase";
import { CompetitorAnalysisSummary } from "@/lib/competitor-analysis";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * 分析結果をDBに保存
 * POST /api/analysis/save
 * Body: { articleUrl: string, siteUrl: string, analysisResult: CompetitorAnalysisSummary, analysisDurationSeconds?: number }
 */
export async function POST(request: NextRequest) {
  console.log("[Analysis Save] POST /api/analysis/save called");
  try {
    const { session, locale } = await getSessionAndLocale(request);
    console.log("[Analysis Save] Session:", session ? "authenticated" : "not authenticated");

    if (!session?.userId) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.authenticationRequiredWithGoogle") },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      articleUrl,
      siteUrl,
      analysisResult,
      analysisDurationSeconds,
    } = body;

    if (!articleUrl || !siteUrl || !analysisResult) {
      return NextResponse.json(
        { error: "Missing required parameters: articleUrl, siteUrl, analysisResult" },
        { status: 400 }
      );
    }

    // siteUrlからsiteIdを取得
    const sites = await getSitesByUserId(session.userId);
    
    // URLを正規化して比較（https://形式に統一）
    const normalizeSiteUrlForComparison = (url: string): string => {
      // 既にhttps://形式の場合はそのまま返す
      if (url.startsWith("https://")) {
        return url.replace(/\/$/, ""); // 末尾のスラッシュを除去
      }
      // sc-domain:形式をhttps://形式に変換
      if (url.startsWith("sc-domain:")) {
        const domain = url.replace("sc-domain:", "");
        return `https://${domain}`;
      }
      // http://形式をhttps://形式に変換
      if (url.startsWith("http://")) {
        return url.replace("http://", "https://").replace(/\/$/, "");
      }
      return url.replace(/\/$/, "");
    };
    
    const normalizedSiteUrl = normalizeSiteUrlForComparison(siteUrl);
    const site = sites.find((s) => {
      const normalizedDbUrl = normalizeSiteUrlForComparison(s.site_url);
      return normalizedDbUrl === normalizedSiteUrl;
    });
    
    if (!site) {
      console.error("[Analysis Save] Site not found:", {
        requestedUrl: siteUrl,
        normalizedUrl: normalizedSiteUrl,
        availableSites: sites.map(s => s.site_url),
      });
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.siteNotFound") },
        { status: 404 }
      );
    }

    // 記事を取得または作成
    let article = await getArticleByUrl(session.userId, articleUrl);
    
    // 記事が存在しない場合は作成、既存の場合はsite_idを更新（site_idが設定されていない場合や変更された場合）
    article = await saveOrUpdateArticle(
      session.userId,
      articleUrl,
      site.id, // siteIdを設定（既存記事の場合も更新）
      article?.title ?? undefined, // 既存のtitleを保持、新規の場合はundefined
      analysisResult.prioritizedKeywords.map((kw: { keyword: string; priority: number; impressions: number; clicks: number; position: number }) => kw.keyword)
    );

    // articleがnullの場合はエラー
    if (!article) {
      return NextResponse.json(
        { error: getErrorMessage(locale, "errors.articleCreateOrGetFailed") },
        { status: 500 }
      );
    }

    // 分析結果をDBに保存
    const { run, result } = await saveAnalysisResult(
      session.userId,
      article.id,
      articleUrl,
      analysisResult,
      "manual", // 手動実行
      analysisDurationSeconds
    );

    // 記事の最終分析日時、キーワード、監視ステータスを更新
    // 注意: saveOrUpdateArticle は last_analyzed_at を自動更新しないため、
    // 直接更新する必要がある
    const supabase = createSupabaseClient();
    await supabase
      .from('articles')
      .update({
        last_analyzed_at: new Date().toISOString(),
        keywords: analysisResult.prioritizedKeywords.map((kw: { keyword: string; priority: number; impressions: number; clicks: number; position: number }) => kw.keyword),
        is_monitoring: true, // 分析開始時に監視を開始
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    return NextResponse.json({
      success: true,
      analysisRunId: run.id,
      analysisResultId: result.id,
      articleId: article.id,
    });
  } catch (error: any) {
    console.error("[Analysis Save] Error:", error);
    const { locale } = await getSessionAndLocale(request);
    return NextResponse.json(
      {
        error: error.message || getErrorMessage(locale, "errors.analysisResultSaveFailed"),
      },
      { status: 500 }
    );
  }
}

