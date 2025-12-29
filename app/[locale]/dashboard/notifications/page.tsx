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
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackNotificationType, setSlackNotificationType] = useState<'channel' | 'dm' | null>(null);
  const [slackChannelId, setSlackChannelId] = useState<string | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{id: string, name: string, is_private?: boolean}>>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [notificationTime, setNotificationTime] = useState<string>("09:00");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}`);
      return;
    }

    if (status === "authenticated") {
      fetchNotifications();
      fetchSlackSettings();
    }
  }, [status, filter, router, locale]);

  // URLパラメータからメッセージを取得
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("slack_connected") === "true") {
        setSuccess(t("notification.settings.slackConnected"));
        // URLからパラメータを削除
        window.history.replaceState({}, "", window.location.pathname);
        fetchSlackSettings(); // 設定を再取得
      }
      if (params.get("error")) {
        setError(params.get("error") || t("notification.settings.error"));
      }
    }
  }, [t]);

  const fetchSlackSettings = async () => {
    try {
      const notificationResponse = await fetch("/api/notification-settings");
      if (notificationResponse.ok) {
        const notificationData = await notificationResponse.json();
        if (notificationData?.slack_bot_token) {
          setSlackConnected(true);
          setSlackNotificationType((notificationData.slack_notification_type as 'channel' | 'dm') || null);
          setSlackChannelId(notificationData.slack_channel_id || null);
          // チャネル一覧を取得（連携直後に自動取得）
          await fetchSlackChannels();
        } else {
          setSlackConnected(false);
          setSlackNotificationType(null);
          setSlackChannelId(null);
          setSlackChannels([]);
        }
        // 通知時刻を設定（HH:MM:SS形式からHH:MM形式に変換）
        if (notificationData?.notification_time) {
          const time = notificationData.notification_time;
          // "09:00:00" -> "09:00"
          const timeParts = time.split(':');
          setNotificationTime(`${timeParts[0]}:${timeParts[1]}`);
        } else {
          setNotificationTime("09:00"); // デフォルト値
        }
      }
    } catch (err: any) {
      console.error("[Notifications] Error fetching Slack settings:", err);
    }
  };

  const fetchSlackChannels = async () => {
    try {
      setLoadingChannels(true);
      console.log("[Notifications] Fetching Slack channels...");
      const response = await fetch("/api/slack/channels");
      console.log("[Notifications] Slack channels API response:", response.status, response.statusText);
      if (response.ok) {
        const data = await response.json();
        console.log("[Notifications] Slack channels received:", data.channels?.length || 0, "channels");
        setSlackChannels(data.channels || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("[Notifications] Failed to fetch Slack channels:", response.status, errorData);
      }
    } catch (err: any) {
      console.error("[Notifications] Error fetching Slack channels:", err);
      setSlackChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

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

      {/* 通知設定セクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("notification.settings.title")}
        </h2>

        {/* 通知時刻設定 */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t("notification.settings.notificationTime")}
          </label>
          <p className="text-xs text-gray-500 mb-3">
            {t("notification.settings.notificationTimeDescription")}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={notificationTime}
              onChange={(e) => setNotificationTime(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button
              onClick={async () => {
                try {
                  // HH:MM形式をHH:MM:SS形式に変換
                  const timeValue = notificationTime + ":00";
                  const response = await fetch("/api/notification-settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      notificationTime: timeValue,
                    }),
                  });
                  if (response.ok) {
                    setSuccess(t("notification.settings.saved"));
                    setTimeout(() => setSuccess(null), 3000);
                  } else {
                    const errorData = await response.json();
                    setError(errorData.error || t("notification.settings.error"));
                  }
                } catch (err: any) {
                  console.error("[Notifications] Error saving notification time:", err);
                  setError(t("notification.settings.error"));
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t("notification.settings.save") || "保存"}
            </button>
          </div>
        </div>

        {/* Slack連携セクション */}
        <div>
          <h3 className="text-md font-semibold text-gray-900 mb-4">
            {t("notification.settings.slackSettings")}
          </h3>
        
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded">
            {success}
          </div>
        )}

               {!slackConnected ? (
                 <div>
                   <a
                     href={`/api/auth/slack/authorize?state=${Math.random().toString(36).substring(7)}`}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="inline-flex px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
                   >
                     {t("notification.settings.connectSlack")}
                   </a>
            <p className="mt-2 text-sm text-gray-600">
              {t("notification.settings.connectSlackDescription")}
            </p>
          </div>
        ) : (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">
                  {t("notification.settings.slackConnected")}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {slackNotificationType === null 
                    ? "通知先を選択してください"
                    : slackNotificationType === 'dm' 
                    ? t("notification.settings.sendingToDM")
                    : t("notification.settings.sendingToChannel")}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  // 連携解除
                  const response = await fetch("/api/notification-settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      slackBotToken: null,
                      slackUserId: null,
                      slackTeamId: null,
                      slackChannelId: null,
                      slackNotificationType: null,
                    }),
                  });
                  if (response.ok) {
                    setSlackConnected(false);
                    setSlackNotificationType(null);
                    setSlackChannelId(null);
                    setSlackChannels([]);
                    setSuccess(t("notification.settings.slackDisconnected"));
                    // 設定を再取得して状態を確実に更新
                    await fetchSlackSettings();
                  }
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                {t("notification.settings.disconnectSlack")}
              </button>
            </div>

            {/* 通知先選択 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                通知先
              </label>
              {slackNotificationType === null && (
                <div className="mb-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  通知先（DMまたはチャネル）を選択してください
                </div>
              )}
              <select
                value={slackNotificationType === 'dm' ? 'dm' : (slackChannelId || "")}
                onChange={async (e) => {
                  const selectedValue = e.target.value;
                  if (!selectedValue) return;
                  
                  if (selectedValue === 'dm') {
                    // DMを選択
                    const response = await fetch("/api/notification-settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        slackNotificationType: 'dm',
                        slackChannelId: null,
                      }),
                    });
                    if (response.ok) {
                      setSlackNotificationType('dm');
                      setSlackChannelId(null);
                      setSuccess(t("notification.settings.saved"));
                      setTimeout(() => setSuccess(null), 3000);
                      await fetchSlackSettings();
                    }
                  } else {
                    // チャネルを選択
                    const response = await fetch("/api/notification-settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        slackNotificationType: 'channel',
                        slackChannelId: selectedValue,
                      }),
                    });
                    if (response.ok) {
                      setSlackNotificationType('channel');
                      setSlackChannelId(selectedValue);
                      setSuccess(t("notification.settings.saved"));
                      setTimeout(() => setSuccess(null), 3000);
                    }
                  }
                }}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                disabled={loadingChannels}
                onFocus={async () => {
                  // チャネル一覧がまだ取得されていない場合は取得
                  if (slackChannels.length === 0 && !loadingChannels) {
                    await fetchSlackChannels();
                  }
                }}
              >
                <option value="">{t("notification.settings.selectChannelPlaceholder")}</option>
                <option value="dm">{t("notification.settings.sendingToDM")}</option>
                {slackChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name} {channel.is_private ? "(Private)" : ""}
                  </option>
                ))}
              </select>
              {loadingChannels && (
                <p className="text-xs text-gray-500 mt-1">チャネル一覧を取得中...</p>
              )}
            </div>
          </div>
        )}
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

