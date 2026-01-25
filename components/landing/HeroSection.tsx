"use client";

import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";
import { trackCtaClick } from "@/lib/analytics";

export function HeroSection() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session } = useSession();

  // localeに応じて動画のパスを決定
  // ja (jp) の場合は demo-jp.mp4、en の場合は demo-en.mp4
  // それ以外のlocaleの場合は demo-en.mp4 をデフォルトとして使用
  const getDemoVideoPath = (locale: string): string => {
    if (locale === 'ja' || locale === 'jp') {
      return '/videos/demo-jp.mp4';
    }
    // en またはその他のlocaleの場合は demo-en.mp4 を使用
    return '/videos/demo-en.mp4';
  };

  const demoVideoPath = getDemoVideoPath(locale);

  return (
    <section className="py-12 md:py-16">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
          {t("home.heroTitle")}
        </h1>
        <p className="text-base md:text-lg text-gray-600 mb-6">
          {t("home.heroSubtitle").split('\n').map((line: string, i: number) => (
            <span key={i}>
              {line}
              {i < t("home.heroSubtitle").split('\n').length - 1 && <br />}
            </span>
          ))}
        </p>
      </div>

      {/* 簡単な説明 */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
          <p className="text-xs text-blue-700 whitespace-nowrap">
            <strong>{t("auth.accountInfoDescription")}</strong>
          </p>
        </div>
      </div>

      {/* CTAボタン */}
      <div className="text-center mb-8">
        <button
          onClick={() => {
            trackCtaClick("hero");
            const sessionAny = session as any;
            if (sessionAny?.user?.email) {
              localStorage.setItem('lastEmail', sessionAny.user.email);
            }
            signIn("google", { callbackUrl: `/${locale}` });
          }}
          className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg hover:opacity-90 transition-all shadow-lg font-bold text-lg inline-flex items-center"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {t("home.ctaButton")}
        </button>
      </div>

      {/* デモ動画 */}
      <div className="max-w-4xl mx-auto">
        <div className="relative aspect-video rounded-lg overflow-hidden shadow-xl border border-gray-200 bg-gray-100">
          <video
            className="w-full h-full object-contain"
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
          >
            <source src={demoVideoPath} type="video/mp4" />
            {t("home.videoNotSupported")}
          </video>
        </div>
      </div>
    </section>
  );
}

