import { NextRequest, NextResponse } from "next/server";
import { getGSCClient } from "@/lib/gsc-api";

/**
 * 特定記事の時系列データを取得
 * GET /api/gsc/rank-data?siteUrl=...&pageUrl=...&startDate=...&endDate=...
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteUrl = searchParams.get("siteUrl");
    const pageUrl = searchParams.get("pageUrl");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!siteUrl || !pageUrl || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required parameters: siteUrl, pageUrl, startDate, endDate" },
        { status: 400 }
      );
    }

    const client = await getGSCClient();
    const data = await client.getPageTimeSeriesData(siteUrl, pageUrl, startDate, endDate);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching GSC rank data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch rank data" },
      { status: 500 }
    );
  }
}

