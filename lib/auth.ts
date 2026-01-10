import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { getOrCreateUser, getUserByEmail, authenticateUserWithPassword } from "@/lib/db/users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30日間（秒単位）
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30日間（秒単位）
  },
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    pkceCodeVerifier: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 15, // 15分（PKCEコード検証子の有効期限）
      },
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
          access_type: "offline", // リフレッシュトークンを取得するために必要
          prompt: "consent", // リフレッシュトークンを確実に取得するために必要（初回のみ確認画面が表示される）
        },
      },
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await authenticateUserWithPassword(
            credentials.email as string,
            credentials.password as string
          );

          if (!user) {
            return null;
          }

          // メール認証が完了しているかチェック
          if (!user.email_verified) {
            throw new Error("メール認証が完了していません。認証メールを確認してください。");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error: any) {
          console.error("[Auth] Credentials authentication error:", error);
          // アカウントロックエラーの場合は、そのままエラーメッセージを返す
          if (error.message?.includes('ロックされています')) {
            throw error;
          }
          // その他のエラーは認証失敗として扱う
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      try {
        // リダイレクトURLが相対パスの場合、baseUrlを追加
        if (url.startsWith("/")) {
          // 既にロケールが含まれている場合はそのまま返す
          // /ja, /ja/, /ja/dashboard などに対応
          if (url.match(/^\/(ja|en)(\/|$)/)) {
            return `${baseUrl}${url}`;
          }
          // ロケールが含まれていない場合は、デフォルトロケール（ja）を追加
          return `${baseUrl}/ja${url}`;
        }
        // 同じオリジンのURLの場合、そのまま返す
        try {
          const urlObj = new URL(url);
          if (urlObj.origin === baseUrl) return url;
        } catch (e) {
          console.error("[Auth] Invalid redirect URL:", url, e);
        }
        // デフォルトはトップページにリダイレクト（分析画面に戻る）
        return `${baseUrl}/ja`;
      } catch (error: any) {
        console.error("[Auth] Redirect callback error:", {
          error: error.message,
          stack: error.stack,
          url,
          baseUrl,
        });
        // エラーが発生した場合は、デフォルトのトップページにリダイレクト
        return `${baseUrl}/ja`;
      }
    },
    async jwt({ token, account, user, trigger }) {
      try {
        // 初回ログイン時にアクセストークンを保存
        if (account && user) {
          // Google OAuthの場合のみアクセストークンを保存
          if (account.provider === "google") {
            token.accessToken = account.access_token;
            token.refreshToken = account.refresh_token;
            token.expiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000; // ミリ秒に変換
            
            // リフレッシュトークンの取得状況をログに記録
            if (!account.refresh_token) {
              console.warn("[Auth] Refresh token not provided by Google OAuth:", {
                hasAccessToken: !!account.access_token,
                hasRefreshToken: !!account.refresh_token,
                email: user.email,
                provider: account.provider,
                note: "This may happen if access_type=offline or prompt=consent is not properly set, or if the user has already granted permissions before."
              });
            } else {
              console.log("[Auth] Refresh token successfully obtained:", {
                email: user.email,
                refreshTokenLength: account.refresh_token.length,
                refreshTokenPrefix: account.refresh_token.substring(0, 20) + "...",
              });
            }
          }
          
          // ユーザー情報をDBに保存
          if (user.email) {
            try {
              if (account.provider === "google") {
                const dbUser = await getOrCreateUser(
                  user.email,
                  user.name || null,
                  account.provider,
                  account.providerAccountId
                );
                token.userId = dbUser.id;
              } else if (account.provider === "credentials") {
                // Credentials認証の場合は既にDBにユーザーが存在する
                const dbUser = await getUserByEmail(user.email);
                if (dbUser) {
                  token.userId = dbUser.id;
                }
              }
            } catch (error: any) {
              console.error("[Auth] Failed to save user to database:", {
                error: error.message,
                stack: error.stack,
                email: user.email,
                provider: account.provider,
              });
              // エラーが発生してもログインは続行
            }
          }
          
          return token;
        }
      } catch (error: any) {
        console.error("[Auth] JWT callback error:", {
          error: error.message,
          stack: error.stack,
          hasAccount: !!account,
          hasUser: !!user,
        });
        // エラーが発生してもトークンを返す（ログインは続行）
        return token;
      }

      // Google OAuthトークンの有効期限をチェック（10分前を閾値としてリフレッシュ）
      // Credentials認証の場合はトークンリフレッシュ不要
      if (token.refreshToken) {
        const now = Date.now();
        const expiresAt = token.expiresAt as number;
        
        // トークンがまだ有効（10分以上残っている）場合はそのまま返す
        if (expiresAt && now < expiresAt - 10 * 60 * 1000) {
          return token;
        }

        // トークンが期限切れまたは期限切れ間近の場合、リフレッシュ
        try {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              refresh_token: token.refreshToken as string,
              grant_type: "refresh_token",
            }),
          });

          if (response.ok) {
            const refreshedTokens = await response.json();
            token.accessToken = refreshedTokens.access_token;
            token.expiresAt = Date.now() + (refreshedTokens.expires_in * 1000);
            
            // リフレッシュトークンが更新された場合は保存
            if (refreshedTokens.refresh_token) {
              token.refreshToken = refreshedTokens.refresh_token;
            }
          } else {
            const errorText = await response.text();
            console.error("[Auth] Failed to refresh token:", response.status, errorText);
            // リフレッシュに失敗した場合、トークンをクリアして再ログインを促す
            token.accessToken = undefined;
            token.refreshToken = undefined;
            token.expiresAt = undefined;
          }
        } catch (error) {
          console.error("[Auth] Error refreshing token:", error);
          token.accessToken = undefined;
          token.refreshToken = undefined;
          token.expiresAt = undefined;
        }
      }

      return token;
    },
    async session({ session, token }) {
      try {
        // セッションにアクセストークン、リフレッシュトークン、ユーザーIDを追加
        if (token) {
          if (token.accessToken) {
            (session as any).accessToken = token.accessToken;
          }
          
          // リフレッシュトークンもセッションに追加（サイト保存時に使用）
          if (token.refreshToken) {
            (session as any).refreshToken = token.refreshToken;
          }
          
          // userIdが設定されていない場合、メールアドレスから取得
          if (!token.userId && session.user?.email) {
            try {
              const dbUser = await getUserByEmail(session.user.email);
              if (dbUser) {
                token.userId = dbUser.id;
                (session as any).userId = dbUser.id;
              }
            } catch (error: any) {
              console.error("[Auth] Failed to get user from database:", {
                error: error.message,
                stack: error.stack,
                email: session.user?.email,
              });
            }
          } else if (token.userId) {
            (session as any).userId = token.userId;
          }
        }
        return session;
      } catch (error: any) {
        console.error("[Auth] Session callback error:", {
          error: error.message,
          stack: error.stack,
          hasToken: !!token,
          hasSession: !!session,
        });
        // エラーが発生してもセッションを返す
        return session;
      }
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});


