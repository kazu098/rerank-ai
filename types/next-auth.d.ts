import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string; // リフレッシュトークンもセッションに含める（サイト保存時に使用）
    userId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    userId?: string;
  }
}
