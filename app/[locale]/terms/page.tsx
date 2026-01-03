"use client";

import { useTranslations } from "next-intl";
import { Navigation } from "@/components/landing/Navigation";
import { Footer } from "@/components/landing/Footer";
import { useLocale } from "next-intl";

export default function TermsPage() {
  const t = useTranslations("terms");
  const locale = useLocale();

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">{t("title")}</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6">
            {t("lastUpdated")}: {new Date().toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US')}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("introduction.title")}</h2>
            <p className="text-gray-700 mb-4">{t("introduction.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("acceptance.title")}</h2>
            <p className="text-gray-700 mb-4">{t("acceptance.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("service.title")}</h2>
            <p className="text-gray-700 mb-4">{t("service.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("service.features").map((feature: string, index: number) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("account.title")}</h2>
            <p className="text-gray-700 mb-4">{t("account.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("account.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("payment.title")}</h2>
            <p className="text-gray-700 mb-4">{t("payment.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("payment.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("userConduct.title")}</h2>
            <p className="text-gray-700 mb-4">{t("userConduct.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("userConduct.prohibited").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("intellectualProperty.title")}</h2>
            <p className="text-gray-700 mb-4">{t("intellectualProperty.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("limitation.title")}</h2>
            <p className="text-gray-700 mb-4">{t("limitation.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("termination.title")}</h2>
            <p className="text-gray-700 mb-4">{t("termination.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("changes.title")}</h2>
            <p className="text-gray-700 mb-4">{t("changes.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("contact.title")}</h2>
            <p className="text-gray-700 mb-4">{t("contact.content")}</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

