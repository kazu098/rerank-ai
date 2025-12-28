/**
 * Slack OAuth連携機能
 */

export interface SlackOAuthTokens {
  accessToken: string;
  botToken: string;
  userId: string; // Slack User ID
  teamId: string; // Slack Team ID
  teamName?: string;
  expiresAt?: Date;
}

/**
 * Slack OAuth認証URLを生成
 */
export function getSlackOAuthUrl(state?: string, requestOrigin?: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  
  // リクエストのオリジンから実際のホストを取得（www付き/なしの両方に対応）
  // ただし、開発環境（localhost）の場合は、本番環境のURLを使用（SlackはHTTPSのみ許可）
  let redirectUri: string;
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      // localhostの場合は、本番環境のURLを使用
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.protocol === 'http:') {
        const baseUrl = process.env.SLACK_REDIRECT_BASE_URL || 'https://rerank-ai.com';
        redirectUri = `${baseUrl}/api/auth/slack/callback`;
        console.log("[Slack OAuth] Using production URL for redirect_uri (localhost detected):", redirectUri);
      } else {
        redirectUri = `${url.origin}/api/auth/slack/callback`;
        console.log("[Slack OAuth] Using request origin for redirect_uri:", redirectUri);
      }
    } catch (e) {
      // URL解析に失敗した場合、フォールバック
      const baseUrl = process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith('https://')
        ? process.env.NEXTAUTH_URL
        : (process.env.SLACK_REDIRECT_BASE_URL || 'https://rerank-ai.com');
      redirectUri = `${baseUrl}/api/auth/slack/callback`;
      console.log("[Slack OAuth] Using fallback URL for redirect_uri:", redirectUri);
    }
  } else {
    // リクエストオリジンが提供されていない場合、環境変数から取得
    const baseUrl = process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith('https://')
      ? process.env.NEXTAUTH_URL
      : (process.env.SLACK_REDIRECT_BASE_URL || 'https://rerank-ai.com');
    redirectUri = `${baseUrl}/api/auth/slack/callback`;
    console.log("[Slack OAuth] Using env var for redirect_uri:", redirectUri);
  }
  
  const scopes = [
    'chat:write', // メッセージ送信
    'chat:write.public', // パブリックチャンネルにメッセージを送信（Botが参加していないチャンネルにも送信可能）
    'users:read', // ユーザー情報取得（User ID取得用）
    'im:write', // DM送信（オプション、chat:writeでカバー可能）
    'channels:read', // パブリックチャネル一覧を取得
    'groups:read', // プライベートチャネル一覧を取得
  ].join(',');

  const params = new URLSearchParams({
    client_id: clientId!,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state || '',
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Slack OAuth認証後のコールバック処理
 * 認証コードからアクセストークンを取得
 */
export async function exchangeSlackCodeForToken(code: string, requestUrl?: string): Promise<SlackOAuthTokens> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  
  // リクエストURLから実際のホストを取得（www付き/なしの両方に対応）
  // ただし、開発環境（localhost）の場合は、本番環境のURLを使用（SlackはHTTPSのみ許可）
  let redirectUri: string;
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      // localhostの場合は、本番環境のURLを使用
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.protocol === 'http:') {
        const baseUrl = process.env.SLACK_REDIRECT_BASE_URL || 'https://rerank-ai.com';
        redirectUri = `${baseUrl}/api/auth/slack/callback`;
        console.log("[Slack OAuth] Using production URL for redirect_uri (localhost detected):", redirectUri);
      } else {
        // リクエストURLのホストとパスを使用
        redirectUri = `${url.origin}/api/auth/slack/callback`;
        console.log("[Slack OAuth] Using request URL for redirect_uri:", redirectUri);
      }
    } catch (e) {
      // URL解析に失敗した場合、フォールバック
      const baseUrl = process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith('https://')
        ? process.env.NEXTAUTH_URL
        : (process.env.SLACK_REDIRECT_BASE_URL || 'https://rerank-ai.com');
      redirectUri = `${baseUrl}/api/auth/slack/callback`;
      console.log("[Slack OAuth] Using fallback URL for redirect_uri:", redirectUri);
    }
  } else {
    // リクエストURLが提供されていない場合、環境変数から取得
    const baseUrl = process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith('https://')
      ? process.env.NEXTAUTH_URL
      : (process.env.SLACK_REDIRECT_BASE_URL || 'https://rerank-ai.com');
    redirectUri = `${baseUrl}/api/auth/slack/callback`;
    console.log("[Slack OAuth] Using env var for redirect_uri:", redirectUri);
  }

  console.log("[Slack OAuth] Exchanging code for token:", {
    redirectUri,
    hasCode: !!code,
    codeLength: code?.length,
  });

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const responseText = await response.text();
  console.log("[Slack OAuth] Token exchange response:", {
    status: response.status,
    statusText: response.statusText,
    responseText: responseText.substring(0, 500), // 最初の500文字のみ
  });

  if (!response.ok) {
    console.error("[Slack OAuth] Token exchange failed:", {
      status: response.status,
      error: responseText,
      redirectUri,
      requestBody: {
        client_id: clientId ? "present" : "missing",
        client_secret: clientSecret ? "present" : "missing",
        code: code ? "present" : "missing",
        redirect_uri: redirectUri,
      },
    });
    throw new Error(`Failed to exchange Slack code: ${response.status} ${responseText}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error("[Slack OAuth] Failed to parse response:", responseText);
    throw new Error(`Invalid JSON response: ${responseText}`);
  }

  if (!data.ok) {
    console.error("[Slack OAuth] Slack API error:", {
      error: data.error,
      redirectUri,
      fullResponse: data,
    });
    throw new Error(`Slack OAuth error: ${data.error}${data.error_description ? ` - ${data.error_description}` : ''}`);
  }
  
  console.log("[Slack OAuth] Token exchange successful");

  // ユーザー情報を取得
  const userInfo = await fetch('https://slack.com/api/users.identity', {
    headers: {
      'Authorization': `Bearer ${data.authed_user.access_token}`,
    },
  });

  const userData = await userInfo.json();

  return {
    accessToken: data.authed_user.access_token,
    botToken: data.access_token, // Bot Token
    userId: userData.user?.id || data.authed_user.id,
    teamId: data.team.id,
    teamName: data.team.name,
    expiresAt: data.authed_user.expires_in
      ? new Date(Date.now() + data.authed_user.expires_in * 1000)
      : undefined,
  };
}

/**
 * Slack User IDを取得（Bot Tokenから）
 */
export async function getSlackUserId(botToken: string, userEmail?: string): Promise<string | null> {
  try {
    // auth.testで現在のユーザー情報を取得
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        'Authorization': `Bearer ${botToken}`,
      },
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[Slack OAuth] Failed to get user info:', data.error);
      return null;
    }

    // メールアドレスからユーザーIDを取得（オプション）
    if (userEmail) {
      const usersResponse = await fetch('https://slack.com/api/users.list', {
        headers: {
          'Authorization': `Bearer ${botToken}`,
        },
      });

      const usersData = await usersResponse.json();
      if (usersData.ok && usersData.members) {
        const user = usersData.members.find((m: any) => m.profile?.email === userEmail);
        if (user) {
          return user.id;
        }
      }
    }

    return data.user_id || null;
  } catch (error: any) {
    console.error('[Slack OAuth] Error getting user ID:', error);
    return null;
  }
}
