"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";

interface UserSettings {
  locale: string;
  timezone: string | null;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    locale: "ja",
    timezone: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // 通知設定関連のstate
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackNotificationType, setSlackNotificationType] = useState<'channel' | 'dm' | null>(null);
  const [slackChannelId, setSlackChannelId] = useState<string | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{id: string, name: string, is_private?: boolean}>>([]);
  const [slackWorkspaceName, setSlackWorkspaceName] = useState<string | null>(null);
  const [slackChannelName, setSlackChannelName] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [notificationTime, setNotificationTime] = useState<string>("09:00");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/`);
      return;
    }

    if (status === "authenticated") {
      fetchSettings();
      fetchNotificationSettings();
    }
  }, [status, router, locale]);

  // URLパラメータからメッセージを取得
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("slack_connected") === "true") {
        setSuccess(t("notification.settings.slackConnected"));
        window.history.replaceState({}, "", window.location.pathname);
        fetchNotificationSettings();
      }
      if (params.get("error")) {
        setError(params.get("error") || t("notification.settings.error"));
      }
    }
  }, [t]);


  const fetchSettings = async () => {
    try {
      setLoading(true);
      // ユーザー情報を取得（ロケールとタイムゾーンを含む）
      const userResponse = await fetch("/api/users/me");
      if (!userResponse.ok) {
        throw new Error("設定の取得に失敗しました");
      }
      const userData = await userResponse.json();

      setSettings({
        locale: userData.locale || "ja",
        timezone: userData.timezone || null,
      });
    } catch (err: any) {
      console.error("[Settings] Error:", err);
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchNotificationSettings = async () => {
    try {
      const notificationResponse = await fetch("/api/notification-settings");
      if (notificationResponse.ok) {
        const notificationData = await notificationResponse.json();
        if (notificationData?.slack_bot_token) {
          setSlackConnected(true);
          setSlackNotificationType((notificationData.slack_notification_type as 'channel' | 'dm') || null);
          setSlackChannelId(notificationData.slack_channel_id || null);
          setSlackWorkspaceName(notificationData.slack_workspace_name || null);
          setSlackChannelName(notificationData.slack_channel_name || null);
          await fetchSlackChannels();
        } else {
          setSlackConnected(false);
          setSlackNotificationType(null);
          setSlackChannelId(null);
          setSlackChannels([]);
          setSlackWorkspaceName(null);
          setSlackChannelName(null);
        }
      }
      // 通知時刻をuser_alert_settingsから取得
      try {
        const alertSettingsResponse = await fetch("/api/alert-settings");
        if (alertSettingsResponse.ok) {
          const alertSettingsData = await alertSettingsResponse.json();
          if (alertSettingsData?.notification_time) {
            const time = alertSettingsData.notification_time;
            const timeParts = time.split(':');
            setNotificationTime(`${timeParts[0]}:${timeParts[1]}`);
          } else {
            setNotificationTime("09:00");
          }
        } else {
          setNotificationTime("09:00");
        }
      } catch (alertErr: any) {
        console.error("[Settings] Error fetching alert settings:", alertErr);
        setNotificationTime("09:00");
      }
    } catch (err: any) {
      console.error("[Settings] Error fetching notification settings:", err);
    }
  };

  const fetchSlackChannels = async () => {
    try {
      setLoadingChannels(true);
      const response = await fetch("/api/slack/channels");
      if (response.ok) {
        const data = await response.json();
        setSlackChannels(data.channels || []);
      }
    } catch (err: any) {
      console.error("[Settings] Error fetching Slack channels:", err);
      setSlackChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // ロケールを更新
      const localeResponse = await fetch("/api/users/update-locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: settings.locale }),
      });

      if (!localeResponse.ok) {
        const errorData = await localeResponse.json();
        throw new Error(errorData.error || "ロケールの更新に失敗しました");
      }

      // タイムゾーンを更新（設定されている場合）
      if (settings.timezone) {
        const timezoneResponse = await fetch("/api/users/update-timezone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: settings.timezone }),
        });

        if (!timezoneResponse.ok) {
          const errorData = await timezoneResponse.json();
          throw new Error(errorData.error || "タイムゾーンの更新に失敗しました");
        }
      }


      setSuccess("設定を保存しました");
      
      // ロケールが変更された場合、ページをリロード
      if (settings.locale !== locale) {
        setTimeout(() => {
          window.location.href = `/${settings.locale}/dashboard/settings`;
        }, 1000);
      }
    } catch (err: any) {
      console.error("[Settings] Error saving:", err);
      setError(err.message || "設定の保存に失敗しました");
    } finally {
      setSaving(false);
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

  if (error && !settings.locale) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchSettings}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 言語設定セクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">言語設定</h2>
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* 言語設定 */}
          <div className="max-w-md">
            <label htmlFor="locale" className="block text-sm font-medium text-gray-700 mb-2">
              言語 / Language
            </label>
            <select
              id="locale"
              value={settings.locale}
              onChange={(e) => setSettings({ ...settings, locale: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              通知メールの言語が変更されます
            </p>
          </div>

          {/* タイムゾーン設定（既存の設定がある場合のみ表示） */}
          {settings.timezone && (
            <div className="max-w-md">
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                タイムゾーン / Timezone
              </label>
              <input
                type="text"
                id="timezone"
                value={settings.timezone}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                タイムゾーンは自動検出されます
              </p>
            </div>
          )}

        </div>

        {/* 保存ボタン */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 通知設定セクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">通知設定</h2>

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
                  const timeValue = notificationTime + ":00";
                  const response = await fetch("/api/alert-settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      notification_time: timeValue,
                    }),
                  });
                  if (response.ok) {
                    setSuccess(t("notification.settings.saved"));
                    setTimeout(() => setSuccess(null), 3000);
                    await fetchNotificationSettings();
                  } else {
                    const errorData = await response.json();
                    setError(errorData.error || t("notification.settings.error"));
                  }
                } catch (err: any) {
                  console.error("[Settings] Error saving notification time:", err);
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
                    {slackWorkspaceName && (
                      <span className="font-semibold">{slackWorkspaceName}</span>
                    )}
                    {slackNotificationType === null 
                      ? slackWorkspaceName ? " - 通知先を選択してください" : "通知先を選択してください"
                      : slackNotificationType === 'dm' 
                      ? slackWorkspaceName ? ` - ${t("notification.settings.sendingToDM")}` : t("notification.settings.sendingToDM")
                      : slackChannelName 
                      ? slackWorkspaceName ? ` - #${slackChannelName}` : `#${slackChannelName}`
                      : slackWorkspaceName ? ` - ${t("notification.settings.sendingToChannel")}` : t("notification.settings.sendingToChannel")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
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
                      setSlackWorkspaceName(null);
                      setSlackChannelName(null);
                      setSuccess(t("notification.settings.slackDisconnected"));
                      await fetchNotificationSettings();
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
                        await fetchNotificationSettings();
                      }
                    } else {
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
    </div>
  );
}

