import { Metadata } from "next";
import Link from "next/link";
import { getBlogPosts, getBlogCategories, getBlogTags } from "@/lib/content/blog";
import { getTranslations } from "next-intl/server";
import { Navigation } from "@/components/landing/Navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; tag?: string }>;
}) {
  const { locale } = await params;
  const { category, tag } = await searchParams;
  const posts = await getBlogPosts(locale);
  const categories = await getBlogCategories(locale);
  const tags = await getBlogTags(locale);

  // フィルタリング
  let filteredPosts = posts;
  if (category) {
    filteredPosts = filteredPosts.filter((post) => post.category === category);
  }
  if (tag) {
    filteredPosts = filteredPosts.filter((post) => post.tags.includes(tag));
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Blog</h1>
          <p className="text-xl text-gray-600">
            SEO対策やツールの使い方、業界トレンドなどの情報をお届けします
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* サイドバー */}
          <aside className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* カテゴリー */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">カテゴリー</h2>
                <ul className="space-y-2">
                  <li>
                    <Link
                      href={`/${locale}/blog`}
                      className={`block px-3 py-2 rounded-md text-sm ${
                        !category
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      すべて
                    </Link>
                  </li>
                  {categories.map((cat) => (
                    <li key={cat}>
                      <Link
                        href={`/${locale}/blog?category=${encodeURIComponent(cat)}`}
                        className={`block px-3 py-2 rounded-md text-sm ${
                          category === cat
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {cat}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* タグ */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">タグ</h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tagName) => (
                    <Link
                      key={tagName}
                      href={`/${locale}/blog?tag=${encodeURIComponent(tagName)}`}
                      className={`px-3 py-1 rounded-full text-xs ${
                        tag === tagName
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {tagName}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* メインコンテンツ */}
          <main className="lg:col-span-3">
            {filteredPosts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">記事が見つかりませんでした</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredPosts.map((post) => (
                  <article
                    key={post.slug}
                    className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
                  >
                    {post.image && (
                      <div className="aspect-[16/9] bg-gray-200 relative overflow-hidden">
                        <img
                          src={post.image}
                          alt={post.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 flex-wrap">
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                          {post.category}
                        </span>
                        <time dateTime={post.date}>
                          {new Date(post.date).toLocaleDateString(locale, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                        <span className="hidden sm:inline">by {post.author}</span>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
                        <Link
                          href={`/${locale}/blog/${post.slug}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {post.title}
                        </Link>
                      </h2>
                      <p className="text-gray-600 mb-4 text-sm line-clamp-2 flex-1">
                        {post.description}
                      </p>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                        <div className="flex flex-wrap gap-1.5">
                          {post.tags.slice(0, 2).map((tagName) => (
                            <span
                              key={tagName}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                            >
                              #{tagName}
                            </span>
                          ))}
                          {post.tags.length > 2 && (
                            <span className="px-2 py-0.5 text-gray-400 text-xs">
                              +{post.tags.length - 2}
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/${locale}/blog/${post.slug}`}
                          className="text-blue-600 hover:text-blue-700 font-medium text-sm whitespace-nowrap"
                        >
                          続きを読む →
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

