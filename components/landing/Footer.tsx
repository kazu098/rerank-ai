"use client";

import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useRouter, usePathname } from "@/src/i18n/routing";
import { useLocale } from "next-intl";

export function Footer() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <footer className="bg-gray-900 text-gray-400 mt-20 w-full pt-12 pb-8 rounded-t-3xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
          {/* サービス */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">{t("footer.service.title")}</h3>
            <ul className="space-y-3">
              <li>
                <a href="#features" className="text-sm hover:text-white transition-colors">
                  {t("footer.service.features")}
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-sm hover:text-white transition-colors">
                  {t("footer.service.howItWorks")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.service.pricing")}
                </a>
              </li>
            </ul>
          </div>

          {/* リソース */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">{t("footer.resources.title")}</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.resources.blog")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.resources.documentation")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.resources.faq")}
                </a>
              </li>
            </ul>
          </div>

          {/* 会社情報 */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">{t("footer.company.title")}</h3>
            <ul className="space-y-3">
              <li>
                <a href={`/${locale}/contact`} className="text-sm hover:text-white transition-colors">
                  {t("footer.company.contact")}
                </a>
              </li>
              <li>
                <a href={`/${locale}/privacy`} className="text-sm hover:text-white transition-colors">
                  {t("footer.company.privacyPolicy")}
                </a>
              </li>
              <li>
                <a href={`/${locale}/terms`} className="text-sm hover:text-white transition-colors">
                  {t("footer.company.termsOfService")}
                </a>
              </li>
              <li>
                <a href={`/${locale}/commercial-transactions`} className="text-sm hover:text-white transition-colors">
                  {t("footer.company.commercialTransactions")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* コピーライトと言語切り替え */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500 text-center md:text-left">
              &copy; {new Date().getFullYear()} ReRank AI. {t("footer.allRightsReserved")}
            </p>
            {/* 言語切り替え */}
            <LanguageSwitcher locale={locale} router={router} pathname={pathname} />
          </div>
        </div>
      </div>
    </footer>
  );
}

