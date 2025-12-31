"use client";

import { useTranslations } from "next-intl";

export function HowItWorksSection() {
  const t = useTranslations();

  return (
    <section id="how-it-works" className="py-20 mb-20">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          {t("home.howItWorks.title")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Step 1 */}
          <div className="text-center">
            <div className="w-20 h-20 bg-purple-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-6 mx-auto">
              1
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {t("home.howItWorks.step1.title")}
            </h3>
            <p className="text-gray-600">
              {t("home.howItWorks.step1.description")}
            </p>
          </div>

          {/* Step 2 */}
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-6 mx-auto">
              2
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {t("home.howItWorks.step2.title")}
            </h3>
            <p className="text-gray-600">
              {t("home.howItWorks.step2.description")}
            </p>
          </div>

          {/* Step 3 */}
          <div className="text-center">
            <div className="w-20 h-20 bg-indigo-600 text-white rounded-full flex items-center justify-center text-3xl font-bold mb-6 mx-auto">
              3
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {t("home.howItWorks.step3.title")}
            </h3>
            <p className="text-gray-600">
              {t("home.howItWorks.step3.description")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

