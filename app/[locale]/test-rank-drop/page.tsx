"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

export default function TestRankDropPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [articleUrl, setArticleUrl] = useState(
    "https://mia-cat.com/blog/poketomo-review/"
  );

  const detectRankDrop = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      // URLからサイトURLとページURLを抽出
      const urlObj = new URL(articleUrl);
      const siteUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");

      const response = await fetch("/api/rank-drop/detect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteUrl,
          pageUrl,
          comparisonDays: 7,
          dropThreshold: 2,
          keywordDropThreshold: 10,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to detect rank drop");
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">読み込み中...</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">順位下落検知テスト</h1>
          <p className="text-gray-600 mb-8">
            まず、Googleアカウントでログインしてください。
          </p>
          <button
            onClick={() => signIn("google")}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">順位下落検知テスト</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              記事URL
            </label>
            <input
              type="text"
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              完全なURLを入力してください（例: https://mia-cat.com/blog/poketomo-review/）
            </p>
          </div>

          <div className="mb-4">
            <button
              onClick={detectRankDrop}
              disabled={loading}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "検知中..." : "順位下落を検知"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold">エラー</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {data && (
            <div className="space-y-4">
              <div
                className={`rounded-lg p-4 ${
                  data.hasDrop
                    ? "bg-red-50 border-2 border-red-300"
                    : "bg-green-50 border-2 border-green-300"
                }`}
              >
                <h2 className="font-bold text-lg mb-2">
                  {data.hasDrop ? "⚠️ 順位下落を検知しました" : "✅ 順位は正常です"}
                </h2>
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>基準期間の平均順位:</strong> {data.baseAveragePosition.toFixed(2)}位
                    <br />
                    <span className="text-gray-600">（{data.baseDate}から過去7日間）</span>
                  </p>
                  <p>
                    <strong>現在の平均順位:</strong> {data.currentAveragePosition.toFixed(2)}位
                    <br />
                    <span className="text-gray-600">（{data.currentDate}）</span>
                  </p>
                  {data.hasDrop && (
                    <p className="text-red-700 font-semibold">
                      <strong>下落幅:</strong> {data.dropAmount.toFixed(2)}位下落
                    </p>
                  )}
                </div>
              </div>

              {data.droppedKeywords.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">
                    転落したキーワード（10位以下）:
                  </h3>
                  <div className="space-y-2">
                    {data.droppedKeywords.map((keyword: any, index: number) => (
                      <div
                        key={index}
                        className="bg-white p-3 rounded border border-yellow-300"
                      >
                        <p className="font-semibold">{keyword.keyword}</p>
                        <div className="text-sm text-gray-600 mt-1">
                          <span>順位: {keyword.position.toFixed(2)}位</span>
                          <span className="ml-4">
                            インプレッション: {keyword.impressions}
                          </span>
                          <span className="ml-4">クリック: {keyword.clicks}</span>
                          <span className="ml-4">CTR: {(keyword.ctr * 100).toFixed(2)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.analysisTargetKeywords.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">分析対象キーワード:</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {data.analysisTargetKeywords.map((keyword: string, index: number) => (
                      <li key={index} className="text-sm">
                        {keyword}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">詳細データ:</h3>
                <pre className="bg-white p-4 rounded border overflow-auto text-xs">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 text-sm">
            <strong>デフォルト設定:</strong>
            <br />
            • 比較期間: 過去7日間
            <br />
            • 急落の判定: 平均順位が2位以上下落、または特定キーワードが10位以下に転落
          </p>
        </div>
      </div>
    </div>
  );
}

