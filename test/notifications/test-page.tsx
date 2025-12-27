"use client";

import { useState } from "react";

/**
 * メール通知のテスト用ページ
 * 
 * 使用方法:
 * 1. このファイルを app/test-notification/page.tsx にコピー
 * 2. 環境変数 RESEND_API_KEY と RESEND_FROM_EMAIL を設定
 * 3. ブラウザで http://localhost:3000/test-notification にアクセス
 */
export default function TestNotificationPage() {
  const [email, setEmail] = useState("kazutaka.yoshinaga@gmail.com");
  const [articleUrl, setArticleUrl] = useState("https://rerank-ai.com/test-article");
  const [articleTitle, setArticleTitle] = useState("テスト記事タイトル");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!email) {
      setError("メールアドレスを入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          articleUrl,
          articleTitle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "メール送信に失敗しました");
      }

      setResult(`メールを送信しました！\n送信先: ${email}\n送信元: ${data.fromEmail || "noreply@rerank-ai.com"}\n\nメールボックスを確認してください。`);
    } catch (err: any) {
      setError(err.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          メール通知テスト
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              送信先メールアドレス *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your-email@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              記事URL（オプション）
            </label>
            <input
              type="url"
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              placeholder="https://rerank-ai.com/test-article"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              記事タイトル（オプション）
            </label>
            <input
              type="text"
              value={articleTitle}
              onChange={(e) => setArticleTitle(e.target.value)}
              placeholder="テスト記事タイトル"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>

          <button
            onClick={handleTest}
            disabled={loading || !email}
            className="w-full bg-purple-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "送信中..." : "テストメールを送信"}
          </button>

          {result && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 whitespace-pre-line">{result}</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>注意:</strong> このページは開発・テスト用です。モックデータを使用してメールを送信します。
              <br />
              <strong>環境変数の確認:</strong>
              <br />
              - RESEND_API_KEY が設定されているか確認してください
              <br />
              - RESEND_FROM_EMAIL=noreply@rerank-ai.com が設定されているか確認してください
              <br />
              <br />
              <strong className="text-green-600">✓ ドメイン検証済み:</strong> 検証済みドメインから送信されるため、任意のメールアドレスに送信できます。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

