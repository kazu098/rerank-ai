import { NextRequest, NextResponse } from "next/server";
import { NotificationService, BulkNotificationItem } from "@/lib/notification";

/**
 * メール通知のテスト用エンドポイント
 * POST /api/notifications/test
 * Body: { 
 *   email: string (送信先メールアドレス),
 *   articleUrl?: string (オプション: 記事URL),
 *   articleTitle?: string (オプション: 記事タイトル)
 * }
 * 
 * このエンドポイントは開発・テスト用です。モックデータを使用してメールを送信します。
 * 開発環境では認証不要です。
 * 
 * 使用方法:
 * 1. このファイルを app/api/notifications/test/route.ts にコピー
 * 2. 環境変数 RESEND_API_KEY と RESEND_FROM_EMAIL を設定
 * 3. テスト実行
 */
export async function POST(request: NextRequest) {
  try {
    // 開発環境では認証をスキップ（本番環境では認証が必要）
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (!isDevelopment) {
      const { auth } = await import("@/lib/auth");
      const session = await auth();
      if (!session?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const { email, articleUrl, articleTitle } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Missing required parameter: email" },
        { status: 400 }
      );
    }

    // モックデータを作成（順位下落のテスト用）
    const mockRankDropInfo = {
      baseAveragePosition: 5.2,
      currentAveragePosition: 12.8,
      dropAmount: 7.6,
      droppedKeywords: [
        {
          keyword: "テストキーワード1",
          position: 15,
          impressions: 1200,
        },
        {
          keyword: "テストキーワード2",
          position: 18,
          impressions: 800,
        },
      ],
    };

    const mockItems: BulkNotificationItem[] = [
      {
        articleUrl: articleUrl || "https://rerank-ai.com/test-article",
        articleTitle: articleTitle || "テスト記事タイトル",
        rankDropInfo: mockRankDropInfo,
        analysisResult: {
          prioritizedKeywords: [
            {
              keyword: "テストキーワード1",
              priority: 1,
              impressions: 1200,
              clicks: 45,
              position: 15,
            },
            {
              keyword: "テストキーワード2",
              priority: 2,
              impressions: 800,
              clicks: 32,
              position: 18,
            },
          ],
          competitorResults: [],
          uniqueCompetitorUrls: [],
          semanticDiffAnalysis: {
            semanticAnalysis: {
              whyCompetitorsRankHigher: "競合記事はより詳細な説明と実例を含んでいます。",
              missingContent: ["実例の追加", "図表の使用", "専門用語の説明"],
              recommendedAdditions: [
                {
                  section: "実例セクション",
                  reason: "具体的な実例を追加することで、ユーザーの理解が深まります。",
                  content: "実際の使用例やケーススタディを追加してください。",
                },
                {
                  section: "図表セクション",
                  reason: "視覚的な情報は理解を助けます。",
                  content: "関連する図表やグラフを追加してください。",
                },
              ],
            },
            keywordSpecificAnalysis: [],
          },
        },
      },
    ];

    // メールを送信
    const notificationService = new NotificationService();
    await notificationService.sendBulkNotification({
      to: email,
      items: mockItems,
      locale: "ja",
    });

    return NextResponse.json({
      success: true,
      message: "Test notification sent successfully",
      sentTo: email,
      fromEmail: process.env.RESEND_FROM_EMAIL || "ReRank AI <noreply@rerank.ai>",
    });
  } catch (error: any) {
    console.error("Error sending test notification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send test notification" },
      { status: 500 }
    );
  }
}

