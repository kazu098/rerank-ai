import { Metadata } from "next";
import Link from "next/link";
import { getDocPages, getDocNavigation } from "@/lib/content/docs";
import { getTranslations } from "next-intl/server";
import { Navigation } from "@/components/landing/Navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });

  return {
    title: t("title") || "ドキュメント",
    description: t("description") || "ReRank AIの使い方ガイド",
  };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const pages = await getDocPages(locale);
  const navigation = getDocNavigation(pages);

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">ドキュメント</h1>
          <p className="text-xl text-gray-600">
            ReRank AIの使い方や機能について詳しく説明します
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* サイドバー（ナビゲーション） */}
          <aside className="lg:col-span-1">
            <div className="sticky top-8">
              <nav className="space-y-6">
                {navigation.map((section) => (
                  <div key={section.category}>
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                      {section.category}
                    </h2>
                    <ul className="space-y-1">
                      {section.pages.map((page) => (
                        <li key={page.slug}>
                          <Link
                            href={`/${locale}/docs/${page.slug}`}
                            className="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                          >
                            {page.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          {/* メインコンテンツ */}
          <main className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                はじめに
              </h2>
              <p className="text-gray-600 mb-6">
                ReRank AIは、Google Search Consoleと連携して、検索順位の下落を自動検知し、
                AIが改善案を提案するSEO自動化ツールです。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {navigation.map((section) => (
                  <div key={section.category} className="border border-gray-200 rounded-lg p-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      {section.category}
                    </h3>
                    <ul className="space-y-2">
                      {section.pages.slice(0, 5).map((page) => (
                        <li key={page.slug}>
                          <Link
                            href={`/${locale}/docs/${page.slug}`}
                            className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-2"
                          >
                            <span>→</span>
                            {page.title}
                          </Link>
                        </li>
                      ))}
                      {section.pages.length > 5 && (
                        <li>
                          <Link
                            href={`/${locale}/docs?category=${encodeURIComponent(section.category)}`}
                            className="text-gray-500 hover:text-gray-700 text-sm"
                          >
                            もっと見る ({section.pages.length - 5}件)
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

