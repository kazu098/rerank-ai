"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// 順位をフォーマット（整数の場合は整数表示、小数がある場合は少数第2位まで）
function formatPosition(position: number | string): string {
  if (typeof position !== 'number') return String(position);
  return Number.isInteger(position) ? position.toFixed(0) : position.toFixed(2);
}

interface KeywordTimeSeriesChartProps {
  keywordTimeSeries: any[];
}

export function KeywordTimeSeriesChart({ keywordTimeSeries }: KeywordTimeSeriesChartProps) {
  const t = useTranslations("chart");
  const locale = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(10); // 一度に表示するキーワード数
  const ITEMS_PER_PAGE = 10; // 1回あたりの追加表示数
  
  const topKeywords = keywordTimeSeries.slice(0, 3);
  const remainingKeywords = keywordTimeSeries.slice(3);

  const renderChart = (kwSeries: any, index: number) => {
    // グラフ用データに変換（日付をMM/DD形式に）
    const chartData = kwSeries.data.map((d: any) => ({
      date: new Date(d.date).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { month: "short", day: "numeric" }),
      position: d.position,
      impressions: d.impressions,
      clicks: d.clicks,
    }));

    // メタデータから警告情報を取得
    const metadata = kwSeries.metadata;
    const hasWarning = metadata?.hasRecentDrop || (metadata?.daysSinceLastData !== null && metadata?.daysSinceLastData >= 3);
    const isDataMissing = kwSeries.data.length === 0;

    return (
      <div key={index} className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm text-gray-700">
            {kwSeries.keyword}
          </h4>
          {hasWarning && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-semibold">
              ⚠️ {t("dropPossibility")}
            </span>
          )}
        </div>
        
        {/* 警告メッセージ */}
        {hasWarning && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3 rounded">
            <p className="text-sm text-yellow-800">
              {metadata?.serperApiNotFound ? (
                <>
                  <strong>⚠️ {t("dropDetected")}:</strong> {t("dropDetectedMessage")}
                  {metadata.lastPosition && (
                    <> {t("lastPositionInGSC", { position: metadata.lastPosition })}</>
                  )}
                </>
              ) : isDataMissing ? (
                <>
                  <strong>{t("attention")}:</strong> {t("noDataForKeyword")}
                  {metadata?.lastPosition && (
                    <> {t("lastRecordedPosition", { position: metadata.lastPosition })}</>
                  )}
                </>
              ) : metadata?.daysSinceLastData !== null && metadata.daysSinceLastData >= 3 ? (
                <>
                  <strong>{t("attention")}:</strong> {t("daysSinceLastData", { days: metadata.daysSinceLastData })}
                  {metadata.lastPosition && (
                    <> {t("lastRecordedPosition", { position: metadata.lastPosition })}</>
                  )}
                  {metadata.lastDataDate && (
                    <> {t("lastDataDate", { date: metadata.lastDataDate })}</>
                  )}
                </>
              ) : null}
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              {t("gscDataNote")}
            </p>
          </div>
        )}
        
        {isDataMissing ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-4 text-center text-sm text-gray-500">
            {t("noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis
              domain={["auto", "auto"]}
              reversed
              tick={{ fontSize: 12 }}
              label={{ value: t("rank"), angle: -90, position: "insideLeft" }}
            />
            <Tooltip formatter={(value: any) => typeof value === 'number' ? (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)) : value} />
            <Legend />
            <Line
              type="monotone"
              dataKey="position"
              stroke="#8b5cf6"
              strokeWidth={2}
              name={t("rank")}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    );
  };

  // 表示するキーワードを制限
  const displayedRemainingKeywords = remainingKeywords.slice(0, displayedCount);
  const hasMore = remainingKeywords.length > displayedCount;

  const handleShowMore = () => {
    setDisplayedCount(prev => Math.min(prev + ITEMS_PER_PAGE, remainingKeywords.length));
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-purple-200">
      <h3 className="font-bold text-lg mb-4 text-gray-800 border-l-4 border-purple-500 pl-3">
        📈 {t("keywordRankingTrend")}
      </h3>
      <div className="space-y-6">
        {topKeywords.map((kwSeries: any, index: number) => renderChart(kwSeries, index))}
      </div>
      
      {/* 残りのキーワードを展開表示（ページネーション対応） */}
      {remainingKeywords.length > 0 && (
        <div className="mt-6">
          <details 
            className="mt-6"
            onToggle={(e) => {
              const isOpen = (e.target as HTMLDetailsElement).open;
              setIsExpanded(isOpen);
              // 展開時に表示数をリセット
              if (isOpen && displayedCount > ITEMS_PER_PAGE) {
                setDisplayedCount(ITEMS_PER_PAGE);
              }
            }}
          >
            <summary className="cursor-pointer text-purple-600 hover:text-purple-800 font-semibold text-sm mb-4">
              {isExpanded ? t("collapse") : t("showMore", { count: remainingKeywords.length })}
            </summary>
            <div className="space-y-6 mt-4">
              {displayedRemainingKeywords.map((kwSeries: any, index: number) => renderChart(kwSeries, index + 3))}
              
              {/* さらに見るボタン */}
              {hasMore && (
                <div className="text-center mt-6">
                  <button
                    onClick={handleShowMore}
                    className="px-6 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-semibold text-sm"
                  >
                    {t("showMoreItems", { count: remainingKeywords.length - displayedCount })}
                  </button>
                </div>
              )}
              
              {/* すべて表示済みの場合 */}
              {!hasMore && displayedCount > 0 && (
                <div className="text-center mt-4 text-sm text-gray-500">
                  {t("allKeywordsShown", { count: remainingKeywords.length })}
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

