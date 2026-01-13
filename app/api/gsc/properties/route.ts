import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionAndLocale, getErrorMessage } from "@/lib/api-helpers";

/**
 * GSCプロパティ一覧を取得
 * GET /api/gsc/properties
 */
export async function GET(request: NextRequest) {
  try {
    // セッションとlocaleを取得（JWTコールバックでトークンが自動リフレッシュされる）
    const { session, locale } = await getSessionAndLocale(request);
    if (!session?.accessToken) {
      return NextResponse.json(
        { 
          error: getErrorMessage(locale, "errors.authenticationRequiredWithGoogle"),
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
            error: getErrorMessage(locale, "errors.tokenExpiredReLogin"),
            code: "TOKEN_EXPIRED",
            details: errorData,
          },
          { status: 401 }
        );
      }

      // 403エラーの場合、認証スコープが不足している可能性
      if (response.status === 403) {
        const errorMessage = errorData?.error?.message || errorData?.message || "";
        const isScopeError = errorMessage.includes("insufficient authentication scopes") || 
                            errorMessage.includes("PERMISSION_DENIED");
        
        if (isScopeError) {
          return NextResponse.json(
            {
              error: getErrorMessage(locale, "errors.insufficientScopes"),
              code: "INSUFFICIENT_SCOPES",
              details: errorData,
            },
            { status: 403 }
          );
        }
        
        return NextResponse.json(
          {
            error: getErrorMessage(locale, "errors.gscPermissionDenied"),
            code: "GSC_PERMISSION_DENIED",
            details: errorData,
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: getErrorMessage(locale, "errors.gscPropertiesFetchFailed"),
          code: "GSC_API_ERROR",
          details: errorData,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const properties = data.siteEntry || [];
    
    // 同じドメインに対して sc-domain: と https:// の両方がある場合、sc-domain: を優先
    // sc-domain: 形式の方がGSC APIで403エラーが発生しにくいため
    const domainMap = new Map<string, any>();
    
    for (const property of properties) {
      const siteUrl = property.siteUrl;
      
      // ドメインを抽出して正規化
      let domain: string;
      if (siteUrl.startsWith("sc-domain:")) {
        domain = siteUrl.replace("sc-domain:", "").replace(/^www\./, "").toLowerCase();
      } else {
        try {
          const urlObj = new URL(siteUrl);
          domain = urlObj.hostname.replace(/^www\./, "").toLowerCase();
        } catch {
          domain = siteUrl.replace(/^www\./, "").toLowerCase();
        }
      }
      
      const existing = domainMap.get(domain);
      if (!existing) {
        // 初めてのドメイン
        domainMap.set(domain, property);
      } else if (siteUrl.startsWith("sc-domain:") && !existing.siteUrl.startsWith("sc-domain:")) {
        // sc-domain: 形式を優先
        domainMap.set(domain, property);
      }
      // https:// 形式で既に sc-domain: が登録されている場合はスキップ
    }
    
    // 統合されたプロパティ一覧を返す
    const mergedProperties = Array.from(domainMap.values());
    
    console.log("[GSC] Properties merged:", {
      originalCount: properties.length,
      mergedCount: mergedProperties.length,
      duplicatesRemoved: properties.length - mergedProperties.length,
    });
    
    return NextResponse.json({ properties: mergedProperties });
  } catch (error: any) {
    console.error("[GSC] Error fetching properties:", error);
    const { locale: errorLocale } = await getSessionAndLocale(request);
    return NextResponse.json(
      { 
        error: error.message || getErrorMessage(errorLocale, "errors.propertiesFetchError"),
        code: "INTERNAL_ERROR"
      },
      { status: 500 }
    );
  }
}

