import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArticlesByUserIdWithPagination, getArticlesStatsByUserId } from "@/lib/db/articles";
import { getLatestAnalysesByArticleIds, getPreviousAnalysesByArticleIds } from "@/lib/db/analysis-results";
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

    // 1. 記事一覧を取得（データベース側でフィルタリング・ソート・ページネーション）
    // positionソートの場合は一旦createdで取得し、後でJavaScriptでソート
    const dbSortBy = sortBy === "position" ? "created" : sortBy === "date" ? "date" : sortBy === "title" ? "title" : "date";
    const { articles, total, totalPages } = await getArticlesByUserIdWithPagination(userId, {
      filter: filter as "all" | "monitoring" | "fixed",
      sortBy: dbSortBy as "date" | "title" | "created",
      page,
      pageSize,
    });

    // 2. 取得した記事の分析結果のみを取得（必要な記事のみに絞り込む）
    const articleIds = articles.map((a) => a.id);
    const [latestAnalysesMap, previousAnalysesMap] = await Promise.all([
      getLatestAnalysesByArticleIds(articleIds),
      getPreviousAnalysesByArticleIds(articleIds),
    ]);

    // 3. 各記事の通知設定を取得
    const notificationSettingsMap = await getNotificationSettingsForArticles(userId, articleIds);

    // 4. 記事に分析結果と通知設定を追加
    let articlesWithData = articles.map((article) => {
      const notificationStatus = notificationSettingsMap.get(article.id) || { email: null, slack: null };
      return {
        ...article,
        latestAnalysis: latestAnalysesMap.get(article.id) || null,
        previousAnalysis: previousAnalysesMap.get(article.id) || null,
        notificationStatus,
      };
    });

    // 5. positionソートの場合はJavaScriptでソート（分析結果が必要なため）
    if (sortBy === "position") {
      articlesWithData.sort((a, b) => {
        const posA = a.latestAnalysis?.average_position ?? 999;
        const posB = b.latestAnalysis?.average_position ?? 999;
        return posA - posB; // 順位が良い順
      });
    }

    // ページネーション済みのデータを使用
    const paginatedArticles = articlesWithData;

    // 6. 未読通知を取得
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

    // 7. 統計情報を取得（全記事ベース、フィルタリング前）
    const stats = await getArticlesStatsByUserId(userId);
    const totalAnalyses = articlesWithData.filter((a) => a.latestAnalysis !== null).length;

    return NextResponse.json(
      {
        articles: paginatedArticles,
        total,
        page,
        pageSize,
        totalPages,
        unreadNotifications: unreadNotifications || [],
        stats: {
          totalArticles: stats.totalArticles,
          monitoringArticles: stats.monitoringArticles,
          totalAnalyses,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      }
    );
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

