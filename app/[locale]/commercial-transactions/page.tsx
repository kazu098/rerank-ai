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

          <div className="overflow-x-auto mb-8">
            <table className="min-w-full border-collapse border border-gray-300">
              <tbody>
                {[
                  { key: "businessName", label: t("items.businessName.label"), value: t("items.businessName.value") },
                  { key: "address", label: t("items.address.label"), value: t("items.address.value") },
                  { key: "contact", label: t("items.contact.label"), value: t("items.contact.value") },
                  { key: "email", label: t("items.email.label"), value: t("items.email.value") },
                  { key: "businessHours", label: t("items.businessHours.label"), value: t("items.businessHours.value") },
                  { key: "pricing", label: t("items.pricing.label"), value: t("items.pricing.value") },
                  { key: "additionalFees", label: t("items.additionalFees.label"), value: t("items.additionalFees.value") },
                  { key: "paymentMethod", label: t("items.paymentMethod.label"), value: t("items.paymentMethod.value") },
                  { key: "paymentTiming", label: t("items.paymentTiming.label"), value: t("items.paymentTiming.value") },
                  { key: "delivery", label: t("items.delivery.label"), value: t("items.delivery.value") },
                  { key: "returns", label: t("items.returns.label"), value: t("items.returns.value") },
                  { key: "cancellation", label: t("items.cancellation.label"), value: t("items.cancellation.value") },
                  { key: "systemRequirements", label: t("items.systemRequirements.label"), value: t("items.systemRequirements.value") },
                  { key: "specialConditions", label: t("items.specialConditions.label"), value: t("items.specialConditions.value") },
                  { key: "liability", label: t("items.liability.label"), value: t("items.liability.value") },
                ].map((item) => {
                  const isEmail = item.key === "email";
                  return (
                    <tr key={item.key} className="border-b border-gray-300">
                      <td className="border border-gray-300 bg-gray-50 px-4 py-3 font-semibold text-gray-700 align-top w-1/3">
                        {item.label}
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700 align-top">
                        {isEmail ? (
                          <a href={`mailto:${item.value}`} className="text-blue-600 hover:text-blue-800 underline">
                            {item.value}
                          </a>
                        ) : (
                          item.value
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

