import { NextRequest, NextResponse } from "next/server";
import { NotificationService } from "@/lib/notification";
import { CompetitorAnalyzer } from "@/lib/competitor-analysis";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

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

    // localeを取得
    const { locale } = await getSessionAndLocale(request);

    // 競合分析を実行
    const analyzer = new CompetitorAnalyzer();
    const analysisResult = await analyzer.analyzeCompetitors(
      siteUrl,
      pageUrl,
      maxKeywords,
      maxCompetitorsPerKeyword,
      false, // skipLLMAnalysis
      locale
    );

    // 差分分析結果がない場合は通知を送信しない
    if (!analysisResult.diffAnalysis) {
      return NextResponse.json({
        success: false,
        message: getErrorMessage(locale, "errors.noDiffAnalysisResult"),
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
      message: getErrorMessage(locale, "errors.notificationSent"),
      analysisResult,
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    const { locale: errorLocale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { error: error.message || getErrorMessage(errorLocale, "errors.notificationFailed") },
      { status: 500 }
    );
  }
}

