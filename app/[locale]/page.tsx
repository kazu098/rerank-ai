"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Navigation } from "@/components/landing/Navigation";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { Footer } from "@/components/landing/Footer";
import { AuthenticatedContent } from "@/components/landing/AuthenticatedContent";

export default function Home() {
  const t = useTranslations();
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {status === "authenticated" ? (
        <>
          {/* ログイン時: 記事分析セクションを表示 */}
          <AuthenticatedContent />
          
          {/* 主な機能以降は共通表示 */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <FeaturesSection />
            <HowItWorksSection />
            <PricingSection />
          </div>
        </>
      ) : (
        <>
          {/* 未ログイン時: 通常のランディングページ */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <HeroSection />
            <FeaturesSection />
            <HowItWorksSection />
            <PricingSection />
          </div>
        </>
      )}

      <Footer />
    </div>
  );
}
