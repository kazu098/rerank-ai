"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export default function TestCompetitorsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("ポケとも 口コミ");
  const [ownUrl, setOwnUrl] = useState("https://mia-cat.com/blog/poketomo-review/");
  const [useAutoAnalysis, setUseAutoAnalysis] = useState(true);

  const extractCompetitors = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      let response;
      if (useAutoAnalysis) {
        // 自動分析モード: 順位下落を検知し、主要なキーワードで競合URLを取得
        const urlObj = new URL(ownUrl);
        const siteUrl = `${urlObj.protocol}//${urlObj.hostname}`;
        const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");

        response = await fetch("/api/competitors/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            siteUrl,
            pageUrl,
            maxKeywords: 3,
            maxCompetitorsPerKeyword: 3,
          }),
        });
      } else {
        // 手動モード: 指定したキーワードで競合URLを取得
        response = await fetch("/api/competitors/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            keyword,
            ownUrl,
            maxCompetitors: 3,
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to extract competitors");
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
          <h1 className="text-4xl font-bold mb-4">競合URL抽出テスト</h1>
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
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-4xl font-bold">競合URL抽出テスト</h1>
          <button
            onClick={() => signOut()}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 text-sm"
          >
            ログアウト
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="mb-6">
            <label className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                checked={useAutoAnalysis}
                onChange={(e) => setUseAutoAnalysis(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-semibold text-gray-700">
                自動分析モード（順位下落を検知し、主要なキーワードで競合URLを取得）
              </span>
            </label>
          </div>

          <div className="space-y-4 mb-6">
            {!useAutoAnalysis && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  検索キーワード
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="ポケとも 口コミ"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {useAutoAnalysis ? "記事URL" : "自社URL"}
              </label>
              <input
                type="text"
                value={ownUrl}
                onChange={(e) => setOwnUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                完全なURLを入力してください
              </p>
            </div>
          </div>

          <div className="mb-4">
            <button
              onClick={extractCompetitors}
              disabled={loading}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "抽出中..." : "競合URLを抽出"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  setData(null);
                  try {
                    const response = await fetch(
                      `/api/competitors/test-browser?keyword=${encodeURIComponent(keyword)}`
                    );
                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || "Failed to test browser tool");
                    }
                    const result = await response.json();
                    setData({ ...result, source: "browser" });
                  } catch (err: any) {
                    setError(err.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm"
              >
                {loading ? "テスト中..." : "ブラウザツールテスト（無料）"}
              </button>
              <button
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  setData(null);
                  try {
                    const response = await fetch(
                      `/api/competitors/test-serper?keyword=${encodeURIComponent(keyword)}`
                    );
                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || "Failed to test Serper API");
                    }
                    const result = await response.json();
                    setData({ ...result, source: "serper" });
                  } catch (err: any) {
                    setError(err.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 disabled:opacity-50 text-sm"
              >
                {loading ? "テスト中..." : "Serper APIテスト（1 search）"}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold">エラー</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {data && (
            <div className="space-y-4">
              {/* テスト結果表示 */}
              {data.source && (
                <div className={`p-4 rounded-lg border-2 ${
                  data.source === "browser" 
                    ? "bg-green-50 border-green-300" 
                    : "bg-purple-50 border-purple-300"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">
                      {data.source === "browser" ? "✓ ブラウザツール（無料）" : "✓ Serper API（有料）"}
                    </h3>
                    {data.success && (
                      <span className="text-xs bg-white px-2 py-1 rounded">
                        {data.message}
                      </span>
                    )}
                  </div>
                  {data.results && (
                    <div className="mt-4">
                      <p className="text-sm mb-2">
                        <strong>キーワード:</strong> {data.keyword}
                      </p>
                      <p className="text-sm mb-2">
                        <strong>検索結果数:</strong> {data.resultsCount || data.competitorsCount}件
                      </p>
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-semibold">検索結果（上位5件）:</p>
                        {data.results.slice(0, 5).map((result: any, index: number) => (
                          <div key={index} className="bg-white p-3 rounded border">
                            <p className="font-semibold text-sm">
                              {result.position}位: {result.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-1 break-all">
                              {result.url}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {useAutoAnalysis ? (
                // 自動分析モードの結果表示
                <>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">選定された主要キーワード</h3>
                    <div className="space-y-2">
                      {data.prioritizedKeywords?.map((kw: any, index: number) => (
                        <div
                          key={index}
                          className="bg-white p-3 rounded border border-green-300"
                        >
                          <p className="font-semibold text-sm">{kw.keyword}</p>
                          <div className="text-xs text-gray-600 mt-1">
                            <span>優先度: {kw.priority.toFixed(2)}</span>
                            <span className="ml-4">順位: {kw.position.toFixed(2)}位</span>
                            <span className="ml-4">インプレッション: {kw.impressions}</span>
                            <span className="ml-4">クリック: {kw.clicks}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">
                      ユニークな競合URL: {data.uniqueCompetitorUrls?.length || 0}件
                    </h3>
                    <div className="space-y-2">
                      {data.uniqueCompetitorUrls?.slice(0, 10).map((url: string, index: number) => (
                        <div
                          key={index}
                          className="bg-white p-2 rounded border border-blue-300"
                        >
                          <p className="text-xs text-gray-600 break-all">{url}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {data.competitorResults?.map((result: any, index: number) => (
                    <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-2">
                        キーワード: {result.keyword}
                      </h3>
                      <div className="text-sm mb-2">
                        <span>自社URLの順位: {result.ownPosition ? `${result.ownPosition}位` : "見つかりませんでした"}</span>
                        <span className="ml-4">競合URL数: {result.competitors.length}件</span>
                      </div>
                      <div className="space-y-2">
                        {result.competitors.map((competitor: any, compIndex: number) => (
                          <div
                            key={compIndex}
                            className="bg-white p-2 rounded border border-yellow-300"
                          >
                            <p className="font-semibold text-xs">
                              {competitor.position}位: {competitor.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-1 break-all">
                              {competitor.url}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                // 手動モードの結果表示
                <>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">抽出結果</h3>
                    <div className="text-sm space-y-2">
                      <p>
                        <strong>自社URLの順位:</strong>{" "}
                        {data.ownPosition ? `${data.ownPosition}位` : "見つかりませんでした"}
                      </p>
                      <p>
                        <strong>取得した検索結果数:</strong> {data.totalResults}件
                      </p>
                      <p>
                        <strong>競合URL数:</strong> {data.competitors.length}件
                      </p>
                    </div>
                  </div>

                  {data.competitors.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-2">競合URL（上位3サイト）:</h3>
                      <div className="space-y-2">
                        {data.competitors.map((competitor: any, index: number) => (
                          <div
                            key={index}
                            className="bg-white p-3 rounded border border-blue-300"
                          >
                            <p className="font-semibold text-sm">
                              {competitor.position}位: {competitor.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-1 break-all">
                              {competitor.url}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            <strong>注意:</strong>
            <br />
            • 実行時間: 5-10秒程度かかります
            <br />
            • CAPTCHAが表示された場合、自動でリトライします（最大3回）
            <br />
            • リクエスト間隔を調整して、レート制限を回避します
          </p>
        </div>
      </div>
    </div>
  );
}

