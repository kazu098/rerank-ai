"use client";

import { useTranslations, useLocale } from "next-intl";
import { signIn, useSession } from "next-auth/react";
import { Link } from "@/src/i18n/routing";
import Image from "next/image";

export function Navigation() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session, status } = useSession();

  return (
    <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href={`/`} className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Image 
                src="/logo.svg" 
                alt="ReRank AI" 
                width={32} 
                height={32}
                className="w-8 h-8"
                onError={(e) => {
                  // ロゴファイルが存在しない場合は非表示にする
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <span>ReRank AI</span>
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              {t("navigation.features")}
            </a>
            <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              {t("navigation.howItWorks")}
            </a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
              {t("footer.service.pricing")}
            </a>
            {status === "authenticated" ? (
              <Link
                href="/dashboard"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                {t("dashboard.title")}
              </Link>
            ) : (
              <button
                onClick={() => {
                  const sessionAny = session as any;
                  if (sessionAny?.user?.email) {
                    localStorage.setItem('lastEmail', sessionAny.user.email);
                  }
                  signIn("google", { callbackUrl: `/${locale}` });
                }}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
              >
                {t("navigation.getStarted")}
              </button>
            )}
          </div>
          <div className="md:hidden">
            {status === "authenticated" ? (
              <Link
                href="/dashboard"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                {t("dashboard.title")}
              </Link>
            ) : (
              <button
                onClick={() => {
                  const sessionAny = session as any;
                  if (sessionAny?.user?.email) {
                    localStorage.setItem('lastEmail', sessionAny.user.email);
                  }
                  signIn("google", { callbackUrl: `/${locale}` });
                }}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-medium"
              >
                {t("navigation.getStarted")}
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

