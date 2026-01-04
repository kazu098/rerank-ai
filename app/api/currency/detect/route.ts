import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { detectCurrencyFromLocale, Currency } from "@/lib/billing/currency";

/**
 * 通貨を自動判定（ロケールベース）
 * GET /api/currency/detect?currency=USD (オプション: 明示的な通貨指定)
 * 
 * 優先順位:
 * 1. クエリパラメータで指定された通貨（ユーザーが手動で選択した場合）
 * 2. ユーザーのロケール設定（DBに保存されている）
 * 3. ブラウザのAccept-Languageヘッダー（初回訪問時など）
 * 4. デフォルト（USD）
 * 
 * 注意: 通貨は常にロケールから導出されます。
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const explicitCurrency = searchParams.get('currency');
    
    // Accept-Languageヘッダーを取得
    const acceptLanguage = request.headers.get('accept-language');
    
    // ユーザー情報を取得（ログインしている場合）
    let userLocale: string | null = null;
    
    const session = await auth();
    if (session?.userId) {
      const user = await getUserById(session.userId);
      if (user) {
        userLocale = user.locale || null;
      }
    }
    
    // 通貨を自動判定（ロケールベース）
    const detectedCurrency = detectCurrencyFromLocale({
      explicitCurrency: explicitCurrency || null,
      userLocale,
      acceptLanguage: acceptLanguage || null,
    });
    
    return NextResponse.json({
      success: true,
      currency: detectedCurrency,
    });
  } catch (error: any) {
    console.error("[Currency Detect API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to detect currency",
        currency: 'USD', // エラー時はデフォルトを返す
      },
      { status: 500 }
    );
  }
}

