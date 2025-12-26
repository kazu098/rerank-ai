import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GSCプロパティ一覧を取得
 * GET /api/gsc/properties
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "認証が必要です。Googleアカウントでログインしてください。" },
        { status: 401 }
      );
    }

    // GSC APIでプロパティ一覧を取得
    const response = await fetch(
      "https://www.googleapis.com/webmasters/v3/sites",
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("[GSC] Failed to fetch properties:", error);
      return NextResponse.json(
        {
          error: "Search Consoleプロパティの取得に失敗しました。",
          details: error,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ properties: data.siteEntry || [] });
  } catch (error: any) {
    console.error("[GSC] Error fetching properties:", error);
    return NextResponse.json(
      { error: error.message || "プロパティの取得中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}

