import { NextRequest, NextResponse } from "next/server";
import { getGSCClient } from "@/lib/gsc-api";

/**
 * キーワード（クエリ）ごとの順位データを取得
 * GET /api/gsc/keywords?siteUrl=...&pageUrl=...&startDate=...&endDate=...
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
    const data = await client.getKeywordData(siteUrl, pageUrl, startDate, endDate);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching GSC keyword data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch keyword data" },
      { status: 500 }
    );
  }
}

