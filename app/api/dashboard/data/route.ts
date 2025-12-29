import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticlesByUserId } from "@/lib/db/articles";
import { getLatestAnalysisResult, getPreviousAnalysisResult, getAnalysisResultsByArticleId } from "@/lib/db/analysis-results";
import { createSupabaseClient } from "@/lib/supabase";
import { getNotificationSettingsForArticles } from "@/lib/db/notification-settings";

/**
 * ダッシュボード用データを取得
 * GET /api/dashboard/data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。Googleアカウントでログインしてください。" },
        { status: 401 }
      );
    }

    const userId = session.userId as string;

    // 1. 記事一覧を取得
    const articles = await getArticlesByUserId(userId);

    // 2. 各記事の最新の分析結果と前回の分析結果を取得
    const articlesWithAnalysis = await Promise.all(
      articles.map(async (article) => {
        const latestAnalysis = await getLatestAnalysisResult(article.id);
        const previousAnalysis = await getPreviousAnalysisResult(article.id);
        return {
          ...article,
          latestAnalysis,
          previousAnalysis,
        };
      })
    );

    // 2.5. 各記事の通知設定を取得
    const articleIds = articles.map(a => a.id);
    const notificationSettingsMap = await getNotificationSettingsForArticles(userId, articleIds);
    
    // 記事に通知設定を追加
    const articlesWithNotifications = articlesWithAnalysis.map(article => {
      const notificationStatus = notificationSettingsMap.get(article.id) || { email: null, slack: null };
      return {
        ...article,
        notificationStatus,
      };
    });

    // 3. 未読通知を取得
    const supabase = createSupabaseClient();
    const { data: unreadNotifications, error: notificationsError } = await supabase
      .from("notifications")
      .select(`
        *,
        article:articles!notifications_article_id_fkey(id, url, title)
      `)
      .eq("user_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (notificationsError) {
      console.error("[Dashboard] Failed to get notifications:", notificationsError);
    }

    // 4. 統計情報を計算
    const totalArticles = articles.length;
    const monitoringArticles = articles.filter((a) => a.is_monitoring).length;
    const totalAnalyses = articlesWithAnalysis.filter((a) => a.latestAnalysis !== null).length;

    return NextResponse.json({
      articles: articlesWithNotifications,
      unreadNotifications: unreadNotifications || [],
      stats: {
        totalArticles,
        monitoringArticles,
        totalAnalyses,
      },
    });
  } catch (error: any) {
    console.error("[Dashboard] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "ダッシュボードデータの取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}

