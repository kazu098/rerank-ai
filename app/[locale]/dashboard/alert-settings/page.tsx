"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "@/src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";

interface AlertSettings {
  position_drop_threshold: number;
  keyword_drop_threshold: number;
  comparison_days: number;
  consecutive_drop_days: number;
  min_impressions: number;
  notification_cooldown_days: number;
  notification_frequency: 'daily' | 'weekly' | 'none';
}

export default function AlertSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AlertSettings>({
    position_drop_threshold: 2.0,
    keyword_drop_threshold: 10,
    comparison_days: 7,
    consecutive_drop_days: 3,
    min_impressions: 100,
    notification_cooldown_days: 7,
    notification_frequency: 'daily',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/alert-settings");
      if (!response.ok) {
        throw new Error(t("alertSettings.fetchFailed"));
      }
      const data = await response.json();
      console.log("[Alert Settings] Fetched data:", data);
      // APIから取得したデータを設定に反映（不足しているフィールドはデフォルト値を使用）
      setSettings({
        position_drop_threshold: data.position_drop_threshold ?? 2.0,
        keyword_drop_threshold: data.keyword_drop_threshold ?? 10,
        comparison_days: data.comparison_days ?? 7,
        consecutive_drop_days: data.consecutive_drop_days ?? 3,
        min_impressions: data.min_impressions ?? 100,
        notification_cooldown_days: data.notification_cooldown_days ?? 7,
        notification_frequency: data.notification_frequency ?? 'daily',
      });
    } catch (err: any) {
      console.error("[Alert Settings] Error:", err);
      setError(err.message || t("alertSettings.errorOccurred"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/`);
      return;
    }

    if (status === "authenticated") {
      fetchSettings();
    }
  }, [status, router, locale, fetchSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch("/api/alert-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("alertSettings.saveFailed"));
      }

      setSuccess(t("alertSettings.saveSuccess"));
      // 保存後に最新の設定を再取得
      await fetchSettings();
    } catch (err: any) {
      console.error("[Alert Settings] Error saving:", err);
      setError(err.message || t("alertSettings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({
      position_drop_threshold: 2.0,
      keyword_drop_threshold: 10,
      comparison_days: 7,
      consecutive_drop_days: 3,
      min_impressions: 100,
      notification_cooldown_days: 7,
      notification_frequency: 'daily',
    });
    setError(null);
    setSuccess(null);
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("alertSettings.title")}</h1>
        <p className="mt-2 text-sm text-gray-600">{t("alertSettings.description")}</p>
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
          {/* 急落の判定条件 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t("alertSettings.dropConditions.title")}
            </h2>

            {/* 平均順位の下落幅 */}
            <div className="mb-4">
              <label htmlFor="position_drop_threshold" className="block text-sm font-medium text-gray-700 mb-2">
                {t("alertSettings.dropConditions.positionDropThreshold")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="position_drop_threshold"
                  min="0"
                  step="0.5"
                  value={settings.position_drop_threshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      position_drop_threshold: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="text-sm text-gray-600">{t("alertSettings.dropConditions.positionsAbove")}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t("alertSettings.dropConditions.positionDropThresholdDescription")}
              </p>
            </div>

            {/* 特定キーワードの転落条件 */}
            <div>
              <label htmlFor="keyword_drop_threshold" className="block text-sm font-medium text-gray-700 mb-2">
                {t("alertSettings.dropConditions.keywordDropThreshold")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="keyword_drop_threshold"
                  min="1"
                  step="1"
                  value={settings.keyword_drop_threshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      keyword_drop_threshold: parseInt(e.target.value) || 10,
                    })
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="text-sm text-gray-600">{t("alertSettings.dropConditions.positionsOrBelow")}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t("alertSettings.dropConditions.keywordDropThresholdDescription")}
              </p>
            </div>
          </div>

          {/* 比較期間 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t("alertSettings.comparisonPeriod.title")}
            </h2>
            <div>
              <label htmlFor="comparison_days" className="block text-sm font-medium text-gray-700 mb-2">
                {t("alertSettings.comparisonPeriod.days")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="comparison_days"
                  min="1"
                  step="1"
                  value={settings.comparison_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      comparison_days: parseInt(e.target.value) || 7,
                    })
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="text-sm text-gray-600">{t("alertSettings.comparisonPeriod.daysSuffix")}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t("alertSettings.comparisonPeriod.description")}
              </p>
            </div>
          </div>

          {/* 通知頻度 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t("alertSettings.notificationFrequency.title")}
            </h2>
            <div className="space-y-2">
              {(['daily', 'weekly', 'none'] as const).map((frequency) => (
                <label key={frequency} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="notification_frequency"
                    value={frequency}
                    checked={settings.notification_frequency === frequency}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                          notification_frequency: e.target.value as 'daily' | 'weekly' | 'none',
                      })
                    }
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    {t(`alertSettings.notificationFrequency.${frequency}`)}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {t("alertSettings.notificationFrequency.description")}
            </p>
          </div>
        </div>

        {/* ボタン */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          >
            {t("alertSettings.resetToDefault")}
          </button>
        </div>
      </div>
    </div>
  );
}

