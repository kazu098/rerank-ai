import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, trigger }) {
      // 初回ログイン時にアクセストークンを保存
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000; // ミリ秒に変換
      }

      // トークンの有効期限をチェック（5分前を閾値としてリフレッシュ）
      const now = Date.now();
      const expiresAt = token.expiresAt as number;
      
      if (expiresAt && now < expiresAt - 5 * 60 * 1000) {
        // トークンがまだ有効（5分以上残っている）
        return token;
      }

      // トークンが期限切れまたは期限切れ間近の場合、リフレッシュ
      if (token.refreshToken) {
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
            console.log("[Auth] Access token refreshed successfully");
          } else {
            console.error("[Auth] Failed to refresh token:", await response.text());
            // リフレッシュに失敗した場合、トークンをクリアして再ログインを促す
            token.accessToken = null;
            token.refreshToken = null;
            token.expiresAt = null;
          }
        } catch (error) {
          console.error("[Auth] Error refreshing token:", error);
          token.accessToken = null;
          token.refreshToken = null;
          token.expiresAt = null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      // セッションにアクセストークンを追加
      if (token) {
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});


