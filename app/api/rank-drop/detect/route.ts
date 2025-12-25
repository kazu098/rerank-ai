import { NextRequest, NextResponse } from "next/server";
import { getGSCClient } from "@/lib/gsc-api";
import { RankDropDetector } from "@/lib/rank-drop-detection";

/**
 * 順位下落を検知
 * POST /api/rank-drop/detect
 * Body: { siteUrl: string, pageUrl: string, comparisonDays?: number, dropThreshold?: number, keywordDropThreshold?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteUrl,
      pageUrl,
      comparisonDays = 7,
      dropThreshold = 2,
      keywordDropThreshold = 10,
    } = body;

    if (!siteUrl || !pageUrl) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl" },
        { status: 400 }
      );
    }

    const client = await getGSCClient();
    const detector = new RankDropDetector(client);
    const result = await detector.detectRankDrop(
      siteUrl,
      pageUrl,
      comparisonDays,
      dropThreshold,
      keywordDropThreshold
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error detecting rank drop:", error);
    return NextResponse.json(
      { error: error.message || "Failed to detect rank drop" },
      { status: 500 }
    );
  }
}

