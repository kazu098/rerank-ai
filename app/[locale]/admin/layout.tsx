"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useTranslations();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated" && session?.userId) {
      // 管理者権限チェック
      checkAdminAccess();
    }
  }, [status, session, router]);

  const checkAdminAccess = async () => {
    try {
      const response = await fetch("/api/admin/dashboard/stats");
      if (response.status === 403) {
        setIsAdmin(false);
        router.push("/");
      } else if (response.ok) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        router.push("/");
      }
    } catch (error) {
      console.error("[Admin Layout] Error checking admin access:", error);
      setIsAdmin(false);
      router.push("/");
    }
  };

  if (status === "loading" || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return null; // リダイレクト中
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">管理画面</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {session?.user?.email}
              </span>
              <Link
                href="/dashboard"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                通常ダッシュボードへ
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* サイドバー */}
        <aside className="w-64 bg-white shadow-sm min-h-[calc(100vh-4rem)]">
          <nav className="p-4">
            <ul className="space-y-2">
              <li>
                <Link
                  href="/admin/dashboard"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  ダッシュボード
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/users"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  ユーザー管理
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/subscriptions"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  サブスクリプション
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/analytics"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  分析状況
                </Link>
              </li>
            </ul>
          </nav>
        </aside>

        {/* メインコンテンツ */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
