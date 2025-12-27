"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

interface Notification {
  id: string;
  article_id: string;
  subject: string | null;
  summary: string | null;
  created_at: string;
  read_at: string | null;
  article: {
    id: string;
    url: string;
    title: string | null;
  } | null;
  analysis_result: {
    id: string;
    average_position: number | null;
    position_change: number | null;
  } | null;
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}`);
      return;
    }

    if (status === "authenticated") {
      fetchNotifications();
    }
  }, [status, filter, router, locale]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter === "unread") {
        params.append("read", "false");
      } else if (filter === "read") {
        params.append("read", "true");
      }

      const response = await fetch(`/api/notifications?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "通知の取得に失敗しました");
      }

      const data = await response.json();
      setNotifications(data.notifications || []);
    } catch (err: any) {
      console.error("[Notifications] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // 既読にする
    if (!notification.read_at) {
      try {
        await fetch(`/api/notifications/${notification.id}/mark-as-read`, {
          method: "POST",
        });
        // 通知リストを更新
        fetchNotifications();
      } catch (err: any) {
        console.error("[Notifications] Error marking as read:", err);
      }
    }

    // 記事詳細ページに遷移
    if (notification.article_id) {
      router.push(`/${locale}/dashboard/articles/${notification.article_id}`);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchNotifications}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">通知履歴</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded text-sm ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              すべて ({notifications.length})
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-4 py-2 rounded text-sm ${
                filter === "unread"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              未読 ({unreadCount})
            </button>
            <button
              onClick={() => setFilter("read")}
              className={`px-4 py-2 rounded text-sm ${
                filter === "read"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              既読 ({notifications.length - unreadCount})
            </button>
          </div>
        </div>
      </div>

      {/* 通知一覧 */}
      <div className="bg-white rounded-lg shadow">
        <div className="divide-y">
          {notifications.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <p>通知がありません</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`px-6 py-4 hover:bg-gray-50 cursor-pointer ${
                  !notification.read_at ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {!notification.read_at && (
                      <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-2 mt-2"></span>
                    )}
                    <h3 className="font-medium text-gray-900 mb-1">
                      {notification.subject || "順位下落を検知"}
                    </h3>
                    {notification.article && (
                      <p className="text-sm text-gray-600 mb-2">
                        {notification.article.title || notification.article.url}
                      </p>
                    )}
                    {notification.summary && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {notification.summary}
                      </p>
                    )}
                    {notification.analysis_result && (
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                        {notification.analysis_result.average_position !== null && (
                          <span>
                            平均順位: {notification.analysis_result.average_position.toFixed(1)}位
                          </span>
                        )}
                        {notification.analysis_result.position_change !== null && (
                          <span
                            className={
                              notification.analysis_result.position_change > 0
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {notification.analysis_result.position_change > 0 ? "+" : ""}
                            {notification.analysis_result.position_change.toFixed(1)}位
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

