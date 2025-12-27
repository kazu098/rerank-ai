import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getOrCreateUser, getUserByEmail } from "@/lib/db/users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
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
    async jwt({ token, account, user, trigger }) {
      // 初回ログイン時にアクセストークンを保存
      if (account && user) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000; // ミリ秒に変換
        
        // ユーザー情報をDBに保存
        if (user.email) {
          try {
            const dbUser = await getOrCreateUser(
              user.email,
              user.name || null,
              account.provider,
              account.providerAccountId
            );
            token.userId = dbUser.id;
          } catch (error) {
            console.error("[Auth] Failed to save user to database:", error);
            // エラーが発生してもログインは続行
          }
        }
        
        return token;
      }

      // トークンの有効期限をチェック（10分前を閾値としてリフレッシュ）
      const now = Date.now();
      const expiresAt = token.expiresAt as number;
      
      // トークンがまだ有効（10分以上残っている）場合はそのまま返す
      if (expiresAt && now < expiresAt - 10 * 60 * 1000) {
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
            
            // リフレッシュトークンが更新された場合は保存
            if (refreshedTokens.refresh_token) {
              token.refreshToken = refreshedTokens.refresh_token;
            }
          } else {
            const errorText = await response.text();
            console.error("[Auth] Failed to refresh token:", response.status, errorText);
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
      // セッションにアクセストークンとユーザーIDを追加
      if (token) {
        if (token.accessToken) {
          (session as any).accessToken = token.accessToken;
        }
        
        // userIdが設定されていない場合、メールアドレスから取得
        if (!token.userId && session.user?.email) {
          try {
            const dbUser = await getUserByEmail(session.user.email);
            if (dbUser) {
              token.userId = dbUser.id;
              (session as any).userId = dbUser.id;
            }
          } catch (error) {
            console.error("[Auth] Failed to get user from database:", error);
          }
        } else if (token.userId) {
          (session as any).userId = token.userId;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});


