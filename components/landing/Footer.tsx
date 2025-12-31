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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
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
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.company.contact")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.company.privacyPolicy")}
                </a>
              </li>
              <li>
                <a href="#" className="text-sm hover:text-white transition-colors">
                  {t("footer.company.termsOfService")}
                </a>
              </li>
            </ul>
          </div>

          {/* ソーシャル */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">{t("footer.social.title")}</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  {t("footer.social.twitter")}
                </a>
              </li>
              <li>
                <a href="#" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                  </svg>
                  GitHub
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

