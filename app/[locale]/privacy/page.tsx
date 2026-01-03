"use client";

import { useTranslations } from "next-intl";
import { Navigation } from "@/components/landing/Navigation";
import { Footer } from "@/components/landing/Footer";
import { useLocale } from "next-intl";

export default function PrivacyPage() {
  const t = useTranslations("privacy");
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
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("dataCollection.title")}</h2>
            
            <h3 className="text-xl font-semibold text-gray-800 mb-3">{t("dataCollection.accountInfo.title")}</h3>
            <p className="text-gray-700 mb-4">{t("dataCollection.accountInfo.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("dataCollection.accountInfo.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-6">{t("dataCollection.gscData.title")}</h3>
            <p className="text-gray-700 mb-4">{t("dataCollection.gscData.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("dataCollection.gscData.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-6">{t("dataCollection.usageData.title")}</h3>
            <p className="text-gray-700 mb-4">{t("dataCollection.usageData.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("dataCollection.usageData.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("dataUsage.title")}</h2>
            <p className="text-gray-700 mb-4">{t("dataUsage.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("dataUsage.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("dataSharing.title")}</h2>
            <p className="text-gray-700 mb-4">{t("dataSharing.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("dataSharing.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("dataProtection.title")}</h2>
            <p className="text-gray-700 mb-4">{t("dataProtection.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("userRights.title")}</h2>
            <p className="text-gray-700 mb-4">{t("userRights.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("userRights.items").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <p className="text-gray-700 mb-4">{t("userRights.contact")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("cookies.title")}</h2>
            <p className="text-gray-700 mb-4">{t("cookies.content")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("thirdParty.title")}</h2>
            <p className="text-gray-700 mb-4">{t("thirdParty.description")}</p>
            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2 ml-4">
              {t.raw("thirdParty.services").map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <p className="text-gray-700 mb-4">{t("thirdParty.note")}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("policyChanges.title")}</h2>
            <p className="text-gray-700 mb-4">{t("policyChanges.content")}</p>
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
