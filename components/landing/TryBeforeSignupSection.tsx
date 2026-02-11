"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { trackCtaClick, trackTryRankSearch } from "@/lib/analytics";

type TryResultItem = {
  keyword: string;
  position: number | null;
  positionLabel: string;
};

type TryResult = {
  results: TryResultItem[];
  hint: string | null;
  ctaMessage: string;
};

export function TryBeforeSignupSection() {
  const t = useTranslations("home.trySection");
  const locale = useLocale();

  const [articleUrl, setArticleUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const trimmedKeyword = keyword.trim();
    if (!articleUrl.trim() || !trimmedKeyword) return;

    const keywordCount = trimmedKeyword.split(",").map((k) => k.trim()).filter(Boolean).length;
    trackTryRankSearch(keywordCount);

    setLoading(true);
    try {
      const res = await fetch("/api/try-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleUrl: articleUrl.trim(),
          keyword: trimmedKeyword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError(t("errorRateLimit"));
          return;
        }
        if (res.status === 400 && data.error?.toLowerCase?.().includes("url")) {
          setError(t("errorInvalidUrl"));
          return;
        }
        setError(data.message || t("errorGeneric"));
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      setResult({
        results,
        hint: data.hint ?? null,
        ctaMessage: data.ctaMessage ?? "full_analysis_after_signup",
      });
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = () => {
    trackCtaClick("try_section_result");
    signIn("google", { callbackUrl: `/${locale}` });
  };

  return (
    <section className="py-8 md:py-10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">
          {t("title")}
        </h2>

        {result ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <p className="text-sm text-gray-600 mb-2">
              {result.results.length === 1
                ? t("resultTitle", { keyword: result.results[0].keyword })
                : null}
            </p>
            <ul className="space-y-2 mb-4">
              {result.results.map((item) => {
                const positionDisplay =
                  locale === "en"
                    ? item.position !== null
                      ? `Position ${item.position}`
                      : "Beyond top 20"
                    : item.positionLabel;
                return (
                  <li key={item.keyword} className="text-gray-800">
                    {t("resultItem", { keyword: item.keyword, positionLabel: positionDisplay })}
                  </li>
                );
              })}
            </ul>
            <p className="text-sm text-gray-700 mb-4">
              {t("resultCtaMessage")}
            </p>
            <button
              type="button"
              onClick={handleSignUp}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-lg hover:opacity-90 font-semibold"
            >
              {t("resultCtaButton")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mb-4">
            <div>
              <label htmlFor="try-article-url" className="sr-only">
                {t("articleUrlPlaceholder")}
              </label>
              <input
                id="try-article-url"
                type="url"
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder={t("articleUrlPlaceholder")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="try-keyword" className="sr-only">
                {t("keywordPlaceholder")}
              </label>
              <input
                id="try-keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("keywordPlaceholder")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
                disabled={loading}
                maxLength={500}
              />
              <p className="mt-1 text-xs text-gray-500">
                {t("keywordHint")}
              </p>
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg hover:bg-gray-700 disabled:opacity-50 font-semibold"
            >
              {loading ? t("loading") : t("submitButton")}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
