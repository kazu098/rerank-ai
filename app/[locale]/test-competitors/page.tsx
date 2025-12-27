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
  const [notificationEmail, setNotificationEmail] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);

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
                自動分析モード（順位下落を検知し、主要なキーワードで競合URLを取得・LLM差分分析も実行）
              </span>
            </label>
            {useAutoAnalysis && (
              <div className="ml-6 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>自動分析モードの動作:</strong><br/>
                  1. GSC APIから順位下落を検知<br/>
                  2. 主要なキーワードを抽出<br/>
                  3. 各キーワードで競合URLを取得<br/>
                  4. 競合記事をスクレイピング<br/>
                  5. <strong>意味レベルの差分分析を実行</strong><br/>
                  6. 分析結果を表示
                </p>
              </div>
            )}
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
              {loading 
                ? (useAutoAnalysis ? "分析中..." : "抽出中...") 
                : (useAutoAnalysis ? "競合分析を実行（自動分析モード）" : "競合URLを抽出")}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold">エラー</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {useAutoAnalysis && data && (data.semanticDiffAnalysis || data.diffAnalysis) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                通知先メールアドレス（差分分析結果を送信）
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  onClick={async () => {
                    if (!notificationEmail) {
                      alert("メールアドレスを入力してください");
                      return;
                    }
                    setSendingNotification(true);
                    try {
                      const urlObj = new URL(ownUrl);
                      const siteUrl = `${urlObj.protocol}//${urlObj.hostname}`;
                      const pageUrl = urlObj.pathname + (urlObj.search || "") + (urlObj.hash || "");
                      
                      const response = await fetch("/api/notifications/send", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          siteUrl,
                          pageUrl,
                          email: notificationEmail,
                          maxKeywords: 3,
                          maxCompetitorsPerKeyword: 3,
                        }),
                      });

                      if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || "Failed to send notification");
                      }

                      const result = await response.json();
                      alert("通知を送信しました！");
                    } catch (err: any) {
                      alert(`通知の送信に失敗しました: ${err.message}`);
                    } finally {
                      setSendingNotification(false);
                    }
                  }}
                  disabled={sendingNotification || !notificationEmail}
                  className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {sendingNotification ? "送信中..." : "通知を送信"}
                </button>
              </div>
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
                  {/* 1. キーワード固有の分析結果（最優先） */}
                  {data.semanticDiffAnalysis && data.semanticDiffAnalysis.keywordSpecificAnalysis.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold mb-4">🔑 キーワード固有の分析</h3>
                      {data.semanticDiffAnalysis.keywordSpecificAnalysis.map((kwAnalysis: any, i: number) => (
                        <div key={i} className="bg-white p-4 rounded border mb-3">
                          <p className="font-semibold text-sm mb-2">キーワード: {kwAnalysis.keyword}</p>
                          <p className="text-sm mb-3"><strong>なぜ順位が下がったか:</strong> {kwAnalysis.whyRankingDropped}</p>
                          {kwAnalysis.whatToAdd && kwAnalysis.whatToAdd.length > 0 && (
                            <>
                              <div>
                                <strong className="text-sm">追加すべき項目:</strong>
                                <ul className="list-disc list-inside space-y-2 mt-2">
                                  {kwAnalysis.whatToAdd.map((itemData: any, j: number) => {
                                    // 後方互換性: 文字列の場合とオブジェクトの場合に対応
                                    const item = typeof itemData === 'string' ? itemData : itemData.item;
                                    const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
                                    
                                    return (
                                      <li key={j} className="text-sm flex items-start gap-2">
                                        <span className="flex-1">{item}</span>
                                        {competitorUrls && competitorUrls.length > 0 && (
                                          <span className="text-xs text-gray-500 flex-shrink-0">
                                            ({competitorUrls.length}件の競合サイト)
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                              {/* 競合サイトURLをまとめて表示 */}
                              {kwAnalysis.whatToAdd && kwAnalysis.whatToAdd.some((itemData: any) => {
                                const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
                                return competitorUrls && competitorUrls.length > 0;
                              }) && (
                                <details className="mt-3 pt-3 border-t border-gray-200">
                                  <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                    参考: 競合サイトURL一覧
                                  </summary>
                                  <div className="mt-2 space-y-2">
                                    {kwAnalysis.whatToAdd.map((itemData: any, j: number) => {
                                      const item = typeof itemData === 'string' ? itemData : itemData.item;
                                      const competitorUrls = typeof itemData === 'object' && itemData.competitorUrls ? itemData.competitorUrls : [];
                                      if (!competitorUrls || competitorUrls.length === 0) return null;
                                      
                                      return (
                                        <div key={j} className="text-xs">
                                          <p className="font-semibold text-gray-700 mb-1">{item}</p>
                                          <ul className="list-none space-y-1 ml-2">
                                            {competitorUrls.map((url: string, k: number) => (
                                              <li key={k}>
                                                <a 
                                                  href={url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:text-blue-800 underline break-all"
                                                >
                                                  {url}
                                                </a>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 2. キーワードごとの競合URL */}
                  {data.competitorResults && data.competitorResults.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold mb-4">🔍 キーワードごとの競合URL</h3>
                      <div className="space-y-4">
                        {data.competitorResults.map((result: any, index: number) => (
                          <div key={index} className="bg-white p-4 rounded border border-blue-300">
                            <div className="mb-3">
                              <p className="font-semibold text-sm mb-1">キーワード: {result.keyword}</p>
                              <div className="text-xs text-gray-600">
                                <span>自社URLの順位: {result.ownPosition ? `${result.ownPosition}位` : "不明"}</span>
                                <span className="ml-4">競合URL数: {result.competitors.length}件</span>
                              </div>
                              {result.error && (
                                <p className="text-xs text-red-600 mt-1">⚠️ {result.error}</p>
                              )}
                            </div>
                            {result.competitors && result.competitors.length > 0 && (
                              <div className="space-y-2">
                                {result.competitors.map((comp: any, compIndex: number) => (
                                  <div
                                    key={compIndex}
                                    className="bg-gray-50 p-2 rounded border border-gray-200 hover:border-blue-400 transition-colors"
                                  >
                                    <div className="flex items-start justify-between">
                                      <a
                                        href={comp.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline break-all flex-1"
                                      >
                                        {comp.url}
                                      </a>
                                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                                        {comp.position}位
                                      </span>
                                    </div>
                                    {comp.title && (
                                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{comp.title}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. ユニークな競合URL（クリック可能） */}
                  {data.uniqueCompetitorUrls && data.uniqueCompetitorUrls.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold mb-2">
                        ユニークな競合URL（全キーワード統合）: {data.uniqueCompetitorUrls.length}件
                      </h3>
                      <div className="space-y-2">
                        {data.uniqueCompetitorUrls.slice(0, 10).map((url: string, index: number) => (
                          <div
                            key={index}
                            className="bg-white p-2 rounded border border-green-300 hover:border-green-500 transition-colors"
                          >
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 underline break-all"
                            >
                              {url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. 選定された主要キーワード */}
                  {data.prioritizedKeywords && data.prioritizedKeywords.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold mb-2">選定された主要キーワード</h3>
                      <p className="text-xs text-gray-600 mb-3">
                        優先度は、インプレッション数（最大50点）、クリック数（最大30点）、順位（最大15点）、CTR（最大5点）の合計で計算されます。
                        転落キーワードは優先度が2倍になります。
                      </p>
                      <div className="space-y-2">
                        {data.prioritizedKeywords.map((kw: any, index: number) => (
                          <div
                            key={index}
                            className="bg-white p-3 rounded border border-green-300"
                          >
                            <p className="font-semibold text-sm">{kw.keyword}</p>
                            <div className="text-xs text-gray-600 mt-1">
                              <span className="font-semibold text-blue-600">優先度: {kw.priority.toFixed(2)}点</span>
                              <span className="ml-4">順位: {kw.position.toFixed(2)}位</span>
                              <span className="ml-4">インプレッション: {kw.impressions}</span>
                              <span className="ml-4">クリック: {kw.clicks}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* その他の分析結果（折りたたみ可能） */}
                  {data.semanticDiffAnalysis && (
                    <details className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                      <summary className="font-semibold mb-2 cursor-pointer hover:text-purple-600">
                        🔍 詳細な分析結果 - クリックで展開
                      </summary>
                      <div className="mt-4">
                      
                      <div className="mb-4">
                        <h4 className="font-semibold text-sm mb-2">なぜ競合が上位なのか</h4>
                        <p className="text-sm bg-white p-3 rounded border">{data.semanticDiffAnalysis.semanticAnalysis.whyCompetitorsRankHigher}</p>
                      </div>

                      {data.semanticDiffAnalysis.semanticAnalysis.missingContent.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-sm mb-2">❌ 不足している内容（{data.semanticDiffAnalysis.semanticAnalysis.missingContent.length}個）</h4>
                          <ul className="list-disc list-inside space-y-1 bg-white p-3 rounded border">
                            {data.semanticDiffAnalysis.semanticAnalysis.missingContent.map((content: string, i: number) => (
                              <li key={i} className="text-sm">{content}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 詳細な追加項目は折りたたみ可能にする（情報過多を避けるため） */}
                      {data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length > 0 && (
                        <details className="mb-4">
                          <summary className="font-semibold text-sm mb-2 cursor-pointer hover:text-purple-600">
                            ✨ 追加すべき項目（詳細）（{data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.length}個） - クリックで展開
                          </summary>
                          <div className="space-y-2 mt-2">
                            {data.semanticDiffAnalysis.semanticAnalysis.recommendedAdditions.map((rec: any, i: number) => (
                              <div key={i} className="bg-yellow-50 p-3 rounded border border-yellow-300">
                                <p className="font-semibold text-sm">📝 {rec.section}</p>
                                <p className="text-xs text-gray-600 mt-1">理由: {rec.reason}</p>
                                <p className="text-sm mt-2">{rec.content}</p>
                                {rec.competitorUrls && rec.competitorUrls.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-yellow-400">
                                    <p className="text-xs font-semibold text-gray-700 mb-2">参考: この内容が記載されている競合サイト</p>
                                    <ul className="list-none space-y-1">
                                      {rec.competitorUrls.map((url: string, j: number) => (
                                        <li key={j}>
                                          <a 
                                            href={url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:text-blue-800 underline break-all"
                                          >
                                            {url}
                                          </a>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      </div>
                    </details>
                  )}

                  {/* 基本的な差分分析結果（フォールバック） */}
                  {!data.semanticDiffAnalysis && data.diffAnalysis && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-2">📊 基本的な差分分析結果</h3>
                      <div className="space-y-2 text-sm mb-4">
                        <p><strong>自社記事の文字数:</strong> {data.diffAnalysis.ownArticle.wordCount.toLocaleString()}文字</p>
                        <p><strong>競合記事の平均文字数:</strong> {data.diffAnalysis.wordCountDiff.average.toLocaleString()}文字</p>
                        {data.diffAnalysis.wordCountDiff.diff > 0 && (
                          <p className="text-red-600"><strong>文字数の差:</strong> +{data.diffAnalysis.wordCountDiff.diff.toLocaleString()}文字（競合の方が多い）</p>
                        )}
                      </div>
                      {data.diffAnalysis.recommendations.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">✨ 追加すべき項目（推奨事項）</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {data.diffAnalysis.recommendations.map((rec: string, i: number) => (
                              <li key={i} className="text-sm">{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

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

