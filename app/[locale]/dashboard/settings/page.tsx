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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}`);
      return;
    }

    if (status === "authenticated") {
      fetchSettings();
    }
  }, [status, router, locale]);


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
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
      </div>

      {/* 設定フォーム */}
      <div className="bg-white rounded-lg shadow p-6">
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
    </div>
  );
}

