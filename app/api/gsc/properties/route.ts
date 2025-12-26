import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GSCプロパティ一覧を取得
 * GET /api/gsc/properties
 */
export async function GET(request: NextRequest) {
  try {
    // セッションを取得（JWTコールバックでトークンが自動リフレッシュされる）
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json(
        { 
          error: "認証が必要です。Googleアカウントでログインしてください。",
          code: "UNAUTHORIZED"
        },
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
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      console.error("[GSC] Failed to fetch properties:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });

      // 401エラーの場合、トークンが期限切れまたは無効
      if (response.status === 401) {
        return NextResponse.json(
          {
            error: "認証トークンが期限切れです。再度ログインしてください。",
            code: "TOKEN_EXPIRED",
            details: errorData,
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          error: "Search Consoleプロパティの取得に失敗しました。",
          code: "GSC_API_ERROR",
          details: errorData,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ properties: data.siteEntry || [] });
  } catch (error: any) {
    console.error("[GSC] Error fetching properties:", error);
    return NextResponse.json(
      { 
        error: error.message || "プロパティの取得中にエラーが発生しました。",
        code: "INTERNAL_ERROR"
      },
      { status: 500 }
    );
  }
}

