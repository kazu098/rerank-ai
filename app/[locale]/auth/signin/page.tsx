"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    // localStorageから最後に使用したメールアドレスを取得
    if (typeof window !== "undefined") {
      const lastEmail = localStorage.getItem("lastEmail");
      if (lastEmail) {
        setEmail(lastEmail);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (authMode === "signin") {
        // ログイン
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          // エラーメッセージを多言語対応に変換
          let errorMessage = result.error;
          if (errorMessage === "メール認証が完了していません。認証メールを確認してください。") {
            errorMessage = t("errors.emailNotVerified");
          } else if (errorMessage?.includes("ロックされています")) {
            // アカウントロックエラーはそのまま表示（既に多言語対応されている可能性がある）
            errorMessage = errorMessage;
          }
          setError(errorMessage);
        } else if (result?.ok) {
          // メールアドレスをlocalStorageに保存
          localStorage.setItem("lastEmail", email);
          // ダッシュボードにリダイレクト（ログイン画面からの場合はダッシュボードへ）
          router.push(`/dashboard`);
        }
      } else {
        // 登録
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || t("errors.registrationFailed"));
        } else {
          // メールアドレスをlocalStorageに保存
          localStorage.setItem("lastEmail", email);
          alert(t("errors.registrationComplete"));
          setAuthMode("signin");
        }
      }
    } catch (err: any) {
      // エラーメッセージを多言語対応に変換
      let errorMessage = err.message;
      if (errorMessage === "メール認証が完了していません。認証メールを確認してください。") {
        errorMessage = t("errors.emailNotVerified");
      } else if (errorMessage?.includes("ロックされています")) {
        // アカウントロックエラーはそのまま表示（既に多言語対応されている可能性がある）
        errorMessage = errorMessage;
      } else if (!errorMessage) {
        errorMessage = t("errors.errorOccurred");
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    // GSC連携時にメールアドレスをlocalStorageに保存
    if (email) {
      localStorage.setItem("lastEmail", email);
    }
    // ログイン画面からの場合はダッシュボードへ
    signIn("google", { callbackUrl: `/dashboard` });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {authMode === "signin" ? t("auth.signin.title") : t("auth.signin.signup")}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                {t("auth.signin.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t("auth.signin.email")}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t("auth.signin.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t("auth.signin.password")}
              />
            </div>
          </div>

          {authMode === "signin" && (
            <div className="flex items-center justify-end">
              <div className="text-sm">
                <Link
                  href="/auth/forgot-password"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  {t("auth.signin.forgotPassword")}
                </Link>
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? t("auth.signin.processing") : authMode === "signin" ? t("auth.signin.login") : t("auth.signin.signupButton")}
            </button>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">{t("auth.signin.or")}</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {t("auth.signin.googleSignIn")}
              </button>
            </div>
          </div>

          <div className="text-center text-sm">
            {authMode === "signin" ? (
              <span>
                {t("auth.signin.noAccount")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                  }}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  {t("auth.signin.signupLink")}
                </button>
              </span>
            ) : (
              <span>
                {t("auth.signin.hasAccount")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setError(null);
                  }}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  {t("auth.signin.signinLink")}
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

