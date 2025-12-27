import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../src/i18n/routing";
import "../globals.css";
import { Providers } from "../providers";

export const metadata: Metadata = {
  title: "ReRank AI",
  description: "SEO自動化ツール - 順位下落を自動検知し、リライト案を提示",
};

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
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

