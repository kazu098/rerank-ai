"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSection() {
  const t = useTranslations();
  const locale = useLocale();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = [
    {
      question: t("home.faq.items.0.question"),
      answer: t("home.faq.items.0.answer"),
    },
    {
      question: t("home.faq.items.1.question"),
      answer: t("home.faq.items.1.answer"),
    },
    {
      question: t("home.faq.items.2.question"),
      answer: t("home.faq.items.2.answer"),
    },
    {
      question: t("home.faq.items.3.question"),
      answer: t("home.faq.items.3.answer"),
    },
    {
      question: t("home.faq.items.4.question"),
      answer: t("home.faq.items.4.answer"),
    },
    {
      question: t("home.faq.items.5.question"),
      answer: t("home.faq.items.5.answer"),
    },
    {
      question: t("home.faq.items.6.question"),
      answer: t("home.faq.items.6.answer"),
    },
    {
      question: t("home.faq.items.7.question"),
      answer: t("home.faq.items.7.answer"),
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          {t("home.faq.title")}
        </h2>
        <p className="text-center text-gray-600 mb-12">
          {t("home.faq.subtitle")}
        </p>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow-md overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900 pr-4">
                  {faq.question}
                </span>
                {openIndex === index ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                )}
              </button>
              {openIndex === index && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <a
            href={`/${locale}/docs/troubleshooting/faq`}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            {t("home.faq.viewMore")} →
          </a>
        </div>
      </div>
    </section>
  );
}
