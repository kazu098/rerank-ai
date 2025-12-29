"use client";

import { useEffect } from "react";
import { useRouter } from "@/src/i18n/routing";

export default function NotificationsPage() {
  const router = useRouter();

  useEffect(() => {
    // 設定ページにリダイレクト
    router.replace("/dashboard/settings");
  }, [router]);

  return null;
}
