import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSiteById } from "@/lib/db/sites";

/**
 * サイト情報を取得
 * GET /api/sites/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.userId) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    const { id } = params;

    // サイト情報を取得
    const site = await getSiteById(id);

    if (!site) {
      return NextResponse.json(
        { error: "サイトが見つかりません。" },
        { status: 404 }
      );
    }

    // ユーザーが所有しているか確認
    if (site.user_id !== session.userId) {
      return NextResponse.json(
        { error: "アクセス権限がありません。" },
        { status: 403 }
      );
    }

    return NextResponse.json(site);
  } catch (error: any) {
    console.error("[Sites API] Error:", error);
    return NextResponse.json(
      { error: error.message || "サイト情報の取得に失敗しました。" },
      { status: 500 }
    );
  }
}
