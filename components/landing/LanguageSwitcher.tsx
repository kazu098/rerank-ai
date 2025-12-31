"use client";

import { useState } from "react";

interface LanguageSwitcherProps {
  locale: string;
  router: any;
  pathname: string;
}

export function LanguageSwitcher({ locale, router, pathname }: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'ja', label: '日本語', nativeLabel: '日本語' },
    { code: 'en', label: 'English', nativeLabel: 'English' },
  ];

  const currentLanguage = languages.find(lang => lang.code === locale) || languages[0];

  const handleLanguageChange = (newLocale: string) => {
    // パスは常に /[locale]/... の形式なので、先頭のロケールを置き換える
    const currentPath = pathname.replace(`/${locale}`, '') || '/';
    const newPath = `/${newLocale}${currentPath === '/' ? '' : currentPath}`;
    
    // クエリパラメータとハッシュも保持してリダイレクト
    const queryString = window.location.search;
    const hash = window.location.hash;
    window.location.href = newPath + queryString + hash;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{currentLanguage.code.toUpperCase()}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 min-w-[160px] z-20">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className="w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between text-sm"
              >
                <div>
                  <span className="text-gray-400 text-xs">{lang.code.toUpperCase()}</span>
                  <span className="text-white ml-2">{lang.nativeLabel}</span>
                </div>
                {locale === lang.code && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

