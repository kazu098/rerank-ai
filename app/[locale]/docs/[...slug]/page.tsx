import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocPage, getDocPages, getDocNavigation } from "@/lib/content/docs";
import { getTranslations } from "next-intl/server";
import { Navigation } from "@/components/landing/Navigation";
import { Footer } from "@/components/landing/Footer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const slugString = slug.join("/");
  const page = await getDocPage(slugString, locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  if (!page) {
    return {
      title: locale === 'ja' ? "ページが見つかりません" : "Page Not Found",
    };
  }

  return {
    title: `${page.title} - ${t("documentation")}`,
    description: page.description,
  };
}

export async function generateStaticParams({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const pages = await getDocPages(locale);

  return pages.map((page) => ({
    slug: page.slug.split("/"),
  }));
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;
  const slugString = slug.join("/");
  const page = await getDocPage(slugString, locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  if (!page) {
    notFound();
  }

  const allPages = await getDocPages(locale);
  const navigation = getDocNavigation(allPages);

  // パンくずリスト用のパスを構築
  const breadcrumbPaths = slugString.split("/");
  const breadcrumbs = [
    { name: t("home"), href: `/${locale}` },
    { name: t("documentation"), href: `/${locale}/docs` },
  ];

  let currentPath = "";
  breadcrumbPaths.forEach((segment, index) => {
    currentPath += (index > 0 ? "/" : "") + segment;
    // 現在のページのタイトルを取得（簡易版）
    const currentPage = allPages.find((p) => p.slug === currentPath);
    if (currentPage && index < breadcrumbPaths.length - 1) {
      breadcrumbs.push({
        name: currentPage.title,
        href: `/${locale}/docs/${currentPath}`,
      });
    }
  });
  breadcrumbs.push({ name: page.title, href: `/${locale}/docs/${slugString}` });

  // 構造化データ（BreadcrumbList）
  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `https://rerank-ai.com${crumb.href}`,
    })),
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
                      {section.pages.map((p) => (
                        <li key={p.slug}>
                          <Link
                            href={`/${locale}/docs/${p.slug}`}
                            className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                              p.slug === slugString
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                            }`}
                          >
                            {p.title}
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
            <article className="bg-white border border-gray-200 rounded-lg p-8">
              {/* パンくずリスト */}
              <nav className="mb-8" aria-label="Breadcrumb">
                <ol className="flex items-center flex-wrap gap-2 text-sm text-gray-500">
                  {breadcrumbs.map((crumb, index) => (
                    <li key={index} className="flex items-center gap-2">
                      {index > 0 && <span>/</span>}
                      {index === breadcrumbs.length - 1 ? (
                        <span className="text-gray-900">{crumb.name}</span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="hover:text-gray-700"
                        >
                          {crumb.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>

              {/* ページヘッダー */}
              <header className="mb-8">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                  {page.title}
                </h1>
                {page.description && (
                  <p className="text-xl text-gray-600">{page.description}</p>
                )}
              </header>

              {/* ページ本文 */}
              <div
                className="prose prose-lg max-w-none mb-12"
                dangerouslySetInnerHTML={{ __html: page.htmlContent }}
              />

              {/* フィードバック */}
              <div className="mt-12 pt-8 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      {t("feedback.title")}
                    </p>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 bg-green-50 text-green-700 rounded-md text-sm font-medium hover:bg-green-100 transition-colors">
                        {t("feedback.yes")}
                      </button>
                      <button className="px-4 py-2 bg-red-50 text-red-700 rounded-md text-sm font-medium hover:bg-red-100 transition-colors">
                        {t("feedback.no")}
                      </button>
                    </div>
                  </div>
                  <Link
                    href={`/${locale}/docs`}
                    className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                  >
                    {t("backToList")}
                  </Link>
                </div>
              </div>
            </article>
          </main>
        </div>
      </div>

      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData),
        }}
      />
      <Footer />
    </div>
  );
}

