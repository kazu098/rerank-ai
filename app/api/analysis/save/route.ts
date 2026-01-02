import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveAnalysisResult } from "@/lib/db/analysis-results";
import { saveOrUpdateArticle, getArticleByUrl } from "@/lib/db/articles";
import { getSitesByUserId } from "@/lib/db/sites";
import { createSupabaseClient } from "@/lib/supabase";
import { CompetitorAnalysisSummary } from "@/lib/competitor-analysis";

/**
 * 分析結果をDBに保存
 * POST /api/analysis/save
 * Body: { articleUrl: string, siteUrl: string, analysisResult: CompetitorAnalysisSummary, analysisDurationSeconds?: number }
 */
export async function POST(request: NextRequest) {
  console.log("[Analysis Save] POST /api/analysis/save called");
  try {
    const session = await auth();
    console.log("[Analysis Save] Session:", session ? "authenticated" : "not authenticated");

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。Googleアカウントでログインしてください。" },
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
        { error: "サイトが見つかりません" },
        { status: 404 }
      );
    }

    // 記事を取得または作成
    let article = await getArticleByUrl(session.userId, articleUrl);
    
    if (!article) {
      // 記事が存在しない場合は作成（siteIdを設定、監視を開始）
      article = await saveOrUpdateArticle(
        session.userId,
        articleUrl,
        site.id, // siteIdを設定
        undefined, // titleは後で取得可能
        analysisResult.prioritizedKeywords.map((kw: { keyword: string; priority: number; impressions: number; clicks: number; position: number }) => kw.keyword)
      );
    } else {
      // 既存の記事の場合、監視を開始（is_monitoringをtrueに設定）
      const supabase = createSupabaseClient();
      const { data: updatedArticle, error: updateError } = await supabase
        .from('articles')
        .update({
          is_monitoring: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', article.id)
        .select()
        .single();
      
      if (updateError) {
        console.error("[Analysis Save] Failed to update monitoring status:", updateError);
      } else if (updatedArticle) {
        article = updatedArticle as any;
      }
    }

    // articleがnullの場合はエラー
    if (!article) {
      return NextResponse.json(
        { error: "記事の作成または取得に失敗しました" },
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

    // 記事の最終分析日時とキーワードを更新
    // 注意: saveOrUpdateArticle は last_analyzed_at を自動更新しないため、
    // 直接更新する必要がある
    // また、監視を開始する（is_monitoringをtrueに設定）
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
    return NextResponse.json(
      {
        error: error.message || "分析結果の保存に失敗しました。",
      },
      { status: 500 }
    );
  }
}

