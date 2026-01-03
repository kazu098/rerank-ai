"use client";

import { useState } from "react";
import { Navigation } from "@/components/landing/Navigation";
import { Footer } from "@/components/landing/Footer";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

export default function ContactPage() {
  const t = useTranslations("contact");
  const locale = useLocale();
  const [showGoogleForm, setShowGoogleForm] = useState(false);

  // TODO: Google FormのURLを環境変数または設定ファイルから取得
  const GOOGLE_FORM_URL = process.env.NEXT_PUBLIC_GOOGLE_FORM_URL || "https://forms.gle/YOUR_FORM_ID";

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">{t("title")}</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 mb-6">{t("description")}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("methods.title")}</h2>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-semibold text-blue-900 mb-3">{t("methods.email.title")}</h3>
              <p className="text-gray-700 mb-4">{t("methods.email.description")}</p>
              <p className="text-lg">
                <a 
                  href={`mailto:${t("methods.email.address")}`}
                  className="text-blue-600 hover:text-blue-800 font-semibold"
                >
                  {t("methods.email.address")}
                </a>
              </p>
              <p className="text-sm text-gray-600 mt-2">{t("methods.email.note")}</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-semibold text-green-900 mb-3">{t("methods.form.title")}</h3>
              <p className="text-gray-700 mb-4">{t("methods.form.description")}</p>
              <button
                onClick={() => setShowGoogleForm(!showGoogleForm)}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {showGoogleForm ? t("methods.form.close") : t("methods.form.open")}
              </button>
              
              {showGoogleForm && (
                <div className="mt-4">
                  <iframe
                    src={GOOGLE_FORM_URL}
                    width="100%"
                    height="800"
                    frameBorder="0"
                    marginHeight={0}
                    marginWidth={0}
                    className="rounded-lg"
                    title={t("methods.form.title")}
                  >
                    {t("methods.form.loading")}
                  </iframe>
                </div>
              )}
              
              <p className="text-sm text-gray-600 mt-4">
                {t("methods.form.linkNote")}{" "}
                <a 
                  href={GOOGLE_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-800 underline"
                >
                  {t("methods.form.linkText")}
                </a>
                {locale === 'ja' ? 'をクリックしてください。' : '.'}
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("faq.title")}</h2>
            <p className="text-gray-700 mb-4">{t("faq.description")}</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <p className="text-gray-600">{t("faq.comingSoon")}</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("hours.title")}</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <p className="text-gray-700">
                <strong>{t("hours.support")}</strong> {t("hours.time")}
              </p>
              <p className="text-gray-600 text-sm mt-2">{t("hours.note")}</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">{t("other.title")}</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              {t.raw("other.items").map((item: string, index: number) => (
                <li key={index}>
                  {item.includes("プライバシーポリシー") || item.includes("Privacy Policy") ? (
                    <>
                      {item.split("プライバシーポリシー")[0] || item.split("Privacy Policy")[0]}
                      <a href={`/${locale}/privacy`} className="text-blue-600 hover:text-blue-800 underline">
                        {locale === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}
                      </a>
                      {item.split("プライバシーポリシー")[1] || item.split("Privacy Policy")[1]}
                    </>
                  ) : (
                    item
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
