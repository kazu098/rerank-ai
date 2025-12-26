import { NextRequest, NextResponse } from "next/server";
import { NotificationService } from "@/lib/notification";
import { CompetitorAnalyzer } from "@/lib/competitor-analysis";

/**
 * 競合分析を実行して通知を送信
 * POST /api/notifications/send
 * Body: { siteUrl: string, pageUrl: string, email: string, maxKeywords?: number, maxCompetitorsPerKeyword?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      email,
      maxKeywords = 3,
      maxCompetitorsPerKeyword = 10,
    } = body;

    if (!siteUrl || !pageUrl || !email) {
      return NextResponse.json(
        {
          error:
            "Missing required parameters: siteUrl, pageUrl, email",
        },
        { status: 400 }
      );
    }

    console.log(
      `[Notification] Starting analysis and notification for ${siteUrl}${pageUrl} to ${email}`
    );

    // 競合分析を実行
    const analyzer = new CompetitorAnalyzer();
    const analysisResult = await analyzer.analyzeCompetitors(
      siteUrl,
      pageUrl,
      maxKeywords,
      maxCompetitorsPerKeyword
    );

    // 差分分析結果がない場合は通知を送信しない
    if (!analysisResult.diffAnalysis) {
      return NextResponse.json({
        success: false,
        message: "差分分析結果がありません。競合URLが取得できなかった可能性があります。",
        analysisResult,
      });
    }

    // 通知を送信
    const notificationService = new NotificationService();
    await notificationService.sendDiffAnalysisNotification({
      to: email,
      siteUrl,
      pageUrl,
      analysisResult,
    });

    console.log(`[Notification] Notification sent successfully to ${email}`);

    return NextResponse.json({
      success: true,
      message: "通知を送信しました",
      analysisResult,
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}

