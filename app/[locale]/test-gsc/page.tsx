"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

export default function TestGSCPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [articleUrl, setArticleUrl] = useState("https://mia-cat.com/blog/poketomo-review/");
  const [siteUrl, setSiteUrl] = useState("sc-domain:mia-kit.com");
  const [searchUrl, setSearchUrl] = useState("https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai");

  // URLからサイトURLとページURLを抽出
  const parseUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const siteUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
      return { siteUrl, pageUrl };
    } catch (e) {
      throw new Error("無効なURLです");
    }
  };

  const fetchRankData = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { siteUrl, pageUrl } = parseUrl(articleUrl);
      // GSCデータは1-2日遅れで反映されるため、2日前までを取得
      const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const startDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const response = await fetch(
        `/api/gsc/rank-data?siteUrl=${encodeURIComponent(
          siteUrl
        )}&pageUrl=${encodeURIComponent(pageUrl)}&startDate=${startDate}&endDate=${endDate}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch data");
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeywordData = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { siteUrl, pageUrl } = parseUrl(articleUrl);
      // GSCデータは1-2日遅れで反映されるため、2日前までを取得
      const endDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const startDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const response = await fetch(
        `/api/gsc/keywords?siteUrl=${encodeURIComponent(
          siteUrl
        )}&pageUrl=${encodeURIComponent(pageUrl)}&startDate=${startDate}&endDate=${endDate}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch data");
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPageList = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams({
        siteUrl: siteUrl,
      });
      if (searchUrl) {
        params.append("searchUrl", searchUrl);
      }

      const response = await fetch(`/api/articles/list-test?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch page list");
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
          <h1 className="text-4xl font-bold mb-4">GSC API テスト</h1>
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
        <h1 className="text-4xl font-bold mb-4">GSC API テスト</h1>

        {/* ページ一覧取得テスト */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">ページ一覧取得テスト</h2>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              サイトURL（Search Consoleプロパティ）
            </label>
            <input
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="sc-domain:mia-kit.com または https://mia-kit.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              検索したいURL（オプション）
            </label>
            <input
              type="text"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              このURLがGSC APIのレスポンスに含まれているかを確認します
            </p>
          </div>
          <div className="mb-4">
            <button
              onClick={fetchPageList}
              disabled={loading}
              className="bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 disabled:opacity-50"
            >
              {loading ? "取得中..." : "ページ一覧を取得して検索"}
            </button>
          </div>
        </div>

        {/* 既存のテスト */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">特定記事のデータ取得テスト</h2>
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

          <div className="flex gap-4 mb-4">
            <button
              onClick={fetchRankData}
              disabled={loading}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "取得中..." : "時系列データを取得"}
            </button>
            <button
              onClick={fetchKeywordData}
              disabled={loading}
              className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              {loading ? "取得中..." : "キーワードデータを取得"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold">エラー</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {data && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="font-semibold mb-2">レスポンス:</h2>
              {data.searchResult && (
                <div className="mb-4 p-4 bg-white rounded border">
                  <h3 className="font-semibold mb-2">検索結果:</h3>
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-semibold">完全一致:</span>{" "}
                      <span className={data.searchResult.foundExact ? "text-green-600" : "text-red-600"}>
                        {data.searchResult.foundExact ? "✓ 見つかりました" : "✗ 見つかりませんでした"}
                      </span>
                    </p>
                    {data.searchResult.matchedUrlExact && (
                      <p className="text-xs text-gray-600 break-all">
                        マッチしたURL: {data.searchResult.matchedUrlExact}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold">正規化後一致:</span>{" "}
                      <span className={data.searchResult.found ? "text-green-600" : "text-red-600"}>
                        {data.searchResult.found ? "✓ 見つかりました" : "✗ 見つかりませんでした"}
                      </span>
                    </p>
                    {data.searchResult.matchedUrl && (
                      <p className="text-xs text-gray-600 break-all">
                        マッチしたURL: {data.searchResult.matchedUrl}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      総URL数: {data.totalUrls}件
                    </p>
                  </div>
                </div>
              )}
              {data.articlesExample && data.articlesExample.length > 0 && (
                <div className="mb-4 p-4 bg-white rounded border">
                  <h3 className="font-semibold mb-2">記事URLの例（/articles/を含むURL）:</h3>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    {data.articlesExample.map((url: string, idx: number) => (
                      <li key={idx} className="break-all text-gray-700">{url}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
                  全レスポンスデータを表示
                </summary>
                <pre className="bg-white p-4 rounded border overflow-auto text-xs mt-2 max-h-96">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold">エラー</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 text-sm">
            <strong>注意:</strong> 入力したURLのサイトがGoogle Search
            Consoleで検証されており、認証したアカウントにアクセス権限がある必要があります。
          </p>
        </div>
      </div>
    </div>
  );
}

