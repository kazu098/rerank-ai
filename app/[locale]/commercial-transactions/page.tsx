"use client";

import { useTranslations } from "next-intl";
import { Navigation } from "@/components/landing/Navigation";
import { Footer } from "@/components/landing/Footer";
import { useLocale } from "next-intl";

export default function CommercialTransactionsPage() {
  const t = useTranslations("commercialTransactions");
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
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("business.title")}</h2>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <dt className="font-semibold text-gray-700">{t("business.businessName.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">{t("business.businessName.value")}</dd>
              
              <dt className="font-semibold text-gray-700">{t("business.representative.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">{t("business.representative.value")}</dd>
              
              <dt className="font-semibold text-gray-700">{t("business.address.label")}</dt>
              <dd className="md:col-span-2 text-gray-700 whitespace-pre-line">{t("business.address.value")}</dd>
              
              <dt className="font-semibold text-gray-700">{t("business.contact.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">
                <a href={`mailto:${t("business.contact.email")}`} className="text-blue-600 hover:text-blue-800">
                  {t("business.contact.email")}
                </a>
              </dd>
            </dl>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("pricing.title")}</h2>
            <p className="text-gray-700 mb-4">{t("pricing.description")}</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <ul className="space-y-3 text-gray-700">
                {t.raw("pricing.items").map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-gray-600 text-sm mt-4">{t("pricing.note")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("payment.title")}</h2>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <dt className="font-semibold text-gray-700">{t("payment.method.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">{t("payment.method.value")}</dd>
              
              <dt className="font-semibold text-gray-700">{t("payment.timing.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">{t("payment.timing.value")}</dd>
            </dl>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("service.title")}</h2>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <dt className="font-semibold text-gray-700">{t("service.provision.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">{t("service.provision.value")}</dd>
              
              <dt className="font-semibold text-gray-700">{t("service.method.label")}</dt>
              <dd className="md:col-span-2 text-gray-700">{t("service.method.value")}</dd>
            </dl>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("cancellation.title")}</h2>
            <p className="text-gray-700 mb-4">{t("cancellation.description")}</p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <ul className="space-y-3 text-gray-700">
                {t.raw("cancellation.items").map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("returns.title")}</h2>
            <p className="text-gray-700 mb-4">{t("returns.description")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("disputes.title")}</h2>
            <p className="text-gray-700 mb-4">{t("disputes.description")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("contact.title")}</h2>
            <p className="text-gray-700 mb-4">{t("contact.description")}</p>
            <p className="text-gray-700">
              <a href={`/${locale}/contact`} className="text-blue-600 hover:text-blue-800 underline">
                {t("contact.link")}
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

