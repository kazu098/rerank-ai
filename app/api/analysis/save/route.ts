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
  try {
    const session = await auth();

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
    const normalizedSiteUrl = siteUrl.replace(/\/$/, ""); // 末尾のスラッシュを除去
    const site = sites.find((s) => {
      const normalizedDbUrl = s.site_url.replace(/\/$/, "");
      return normalizedDbUrl === normalizedSiteUrl || 
             normalizedDbUrl === `https://${normalizedSiteUrl}` ||
             normalizedDbUrl === normalizedSiteUrl.replace(/^https?:\/\//, "");
    });
    
    if (!site) {
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

