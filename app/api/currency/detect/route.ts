import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import { detectCurrencyFromLocale, Currency } from "@/lib/billing/currency";

/**
 * 通貨を自動判定（ロケールベース）
 * GET /api/currency/detect?currency=USD&locale=ja (オプション: 明示的な通貨指定、URLロケール)
 * 
 * 優先順位:
 * 1. クエリパラメータで指定された通貨（ユーザーが手動で選択した場合）
 * 2. クエリパラメータで指定されたロケール（URLロケール、最優先）
 * 3. Refererヘッダーから取得したURLロケール
 * 4. ユーザーのロケール設定（DBに保存されている）
 * 5. ブラウザのAccept-Languageヘッダー（初回訪問時など）
 * 6. デフォルト（USD）
 * 
 * 注意: 通貨は常にロケールから導出されます。
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const explicitCurrency = searchParams.get('currency');
    const urlLocale = searchParams.get('locale'); // URLロケールを優先
    
    // Refererヘッダーからロケールを抽出（URLロケールが指定されていない場合）
    let refererLocale: string | null = null;
    if (!urlLocale) {
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          const pathSegments = refererUrl.pathname.split('/').filter(Boolean);
          if (pathSegments.length > 0 && (pathSegments[0] === 'ja' || pathSegments[0] === 'en')) {
            refererLocale = pathSegments[0];
          }
        } catch (e) {
          // URL解析に失敗した場合は無視
        }
      }
    }
    
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
    
    // ロケールを決定（優先順位: URLロケール > Refererロケール > ユーザーロケール > Accept-Language）
    const finalLocale = urlLocale || refererLocale || userLocale || null;
    
    // 通貨を自動判定（ロケールベース）
    const detectedCurrency = detectCurrencyFromLocale({
      explicitCurrency: explicitCurrency || null,
      userLocale: finalLocale, // 優先順位で決定したロケールを使用
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

