import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticlesByUserId } from "@/lib/db/articles";
import { getLatestAnalysesByArticleIds, getPreviousAnalysesByArticleIds, getAnalysisResultsByArticleId } from "@/lib/db/analysis-results";
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
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const filter = searchParams.get("filter") || "all"; // "monitoring" | "fixed" | "all"
    const sortBy = searchParams.get("sortBy") || "date"; // "date" | "position" | "title"

    // 1. 記事一覧を取得
    const articles = await getArticlesByUserId(userId);

    // 2. 各記事の最新の分析結果と前回の分析結果を一括取得（N+1クエリを回避）
    const articleIds = articles.map((a) => a.id);
    const [latestAnalysesMap, previousAnalysesMap] = await Promise.all([
      getLatestAnalysesByArticleIds(articleIds),
      getPreviousAnalysesByArticleIds(articleIds),
    ]);

    const articlesWithAnalysis = articles.map((article) => {
      return {
        ...article,
        latestAnalysis: latestAnalysesMap.get(article.id) || null,
        previousAnalysis: previousAnalysesMap.get(article.id) || null,
      };
    });

    // 2.5. 各記事の通知設定を取得（articleIdsは既に上で定義済み）
    const notificationSettingsMap = await getNotificationSettingsForArticles(userId, articleIds);
    
    // 記事に通知設定を追加
    let articlesWithNotifications = articlesWithAnalysis.map(article => {
      const notificationStatus = notificationSettingsMap.get(article.id) || { email: null, slack: null };
      return {
        ...article,
        notificationStatus,
      };
    });

    // フィルタリング（サーバーサイド）
    if (filter === "monitoring") {
      articlesWithNotifications = articlesWithNotifications.filter((a) => a.is_monitoring);
    } else if (filter === "fixed") {
      articlesWithNotifications = articlesWithNotifications.filter((a) => a.is_fixed);
    }

    // ソート（サーバーサイド）
    articlesWithNotifications.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = a.last_analyzed_at ? new Date(a.last_analyzed_at).getTime() : 0;
        const dateB = b.last_analyzed_at ? new Date(b.last_analyzed_at).getTime() : 0;
        return dateB - dateA; // 新しい順
      } else if (sortBy === "position") {
        const posA = a.latestAnalysis?.average_position ?? 999;
        const posB = b.latestAnalysis?.average_position ?? 999;
        return posA - posB; // 順位が良い順
      } else if (sortBy === "title") {
        const titleA = a.title || a.url;
        const titleB = b.title || b.url;
        return titleA.localeCompare(titleB);
      }
      return 0;
    });

    // ページネーション
    const total = articlesWithNotifications.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedArticles = articlesWithNotifications.slice(startIndex, endIndex);

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

    // 4. 統計情報を計算（全記事ベース、フィルタリング前）
    const totalArticles = articles.length;
    const monitoringArticles = articles.filter((a) => a.is_monitoring).length;
    const totalAnalyses = articlesWithAnalysis.filter((a) => a.latestAnalysis !== null).length;

    return NextResponse.json({
      articles: paginatedArticles,
      total,
      page,
      pageSize,
      totalPages,
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

