import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import Script from "next/script";
import { routing } from "../../src/i18n/routing";
import "../globals.css";
import { Providers } from "../providers";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://rerank-ai.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isJapanese = locale === "ja";

  const title = "ReRank AI";
  const description = isJapanese
    ? "Google Search Consoleと連携するだけで、AIが順位下落を検知し、改善案を自動提案します。AI検索（AIO）や新規記事の提案にも対応。"
    : "Simply connect with Google Search Console, and AI will detect ranking drops and automatically suggest improvements. Supports AI search (AIO) and new article suggestions.";
  const keywords = isJapanese
    ? "SEO, 検索エンジン最適化, AI, 自動化, Google Search Console, 順位監視, 競合分析, 記事改善, SEOツール, リライト提案"
    : "SEO, search engine optimization, AI, automation, Google Search Console, rank monitoring, competitor analysis, article improvement, SEO tool, rewrite suggestions";

  const url = `${baseUrl}/${locale}`;
  const ogImage = `${baseUrl}/logo.svg`;

  return {
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description,
    keywords,
    authors: [{ name: "ReRank AI" }],
    creator: "ReRank AI",
    publisher: "ReRank AI",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: isJapanese ? "ja_JP" : "en_US",
      url,
      title,
      description,
      siteName: "ReRank AI",
      images: [
        {
          url: ogImage,
          width: 500,
          height: 500,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: url,
      languages: {
        ja: `${baseUrl}/ja`,
        en: `${baseUrl}/en`,
        "x-default": `${baseUrl}/ja`,
      },
    },
    icons: {
      icon: [
        { url: "/logo.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "any" },
      ],
      apple: [
        { url: "/logo.svg", type: "image/svg+xml" },
      ],
    },
    metadataBase: new URL(baseUrl),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // 有効なロケールか確認
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // クライアント側にすべてのメッセージを提供
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-0WFJ5YTDF0"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-0WFJ5YTDF0');
          `}
        </Script>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

