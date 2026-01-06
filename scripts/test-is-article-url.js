/**
 * isArticleUrl関数のテストスクリプト
 * 実際のURLでisArticleUrl関数が正しく動作するかを確認
 */

function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    return urlObj.toString();
  } catch (error) {
    const hashIndex = url.indexOf('#');
    return hashIndex >= 0 ? url.substring(0, hashIndex) : url;
  }
}

function isArticleUrl(url) {
  const urlLower = url.toLowerCase();
  let pathname;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch (error) {
    console.error(`[ERROR] Failed to parse URL: ${url}`, error);
    return false;
  }
  
  // 除外するパスパターン
  const excludePatterns = [
    '/tag/',           // タグページ
    '/category/',      // カテゴリーページ
    '/wp-content/uploads/', // メディアファイル
    '/author/',        // 著者ページ
    '/feed/',          // RSSフィード
    '/wp-json/',      // REST API
    '/wp-admin/',      // 管理画面
    '/wp-includes/',   // WordPressコアファイル
    '/page/',          // ページネーションページ（記事のページネーションは除外）
    '/search/',        // 検索結果ページ
    '/archive/',       // アーカイブページ（年月別など）
  ];
  
  // 除外パターンに一致する場合はfalse
  for (const pattern of excludePatterns) {
    if (pathname.includes(pattern)) {
      console.log(`[EXCLUDED] ${url} - Matched pattern: ${pattern}`);
      return false;
    }
  }
  
  // 画像ファイルの拡張子を除外
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp'];
  for (const ext of imageExtensions) {
    if (urlLower.endsWith(ext)) {
      console.log(`[EXCLUDED] ${url} - Image extension: ${ext}`);
      return false;
    }
  }
  
  // その他のファイル拡張子を除外
  const fileExtensions = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx', '.css', '.js'];
  for (const ext of fileExtensions) {
    if (urlLower.endsWith(ext)) {
      console.log(`[EXCLUDED] ${url} - File extension: ${ext}`);
      return false;
    }
  }
  
  return true;
}

// テストケース
const testUrls = [
  // 問題のURL
  'https://mia-kit.com/ja/store-app/articles',
  'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai',
  
  // その他のテストケース
  'https://mia-kit.com/ja/store-app/articles/',
  'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai/',
  'https://example.com/page/2',  // これは除外されるべき
  'https://example.com/articles/page/2',  // これも除外されるべき
  'https://example.com/articles/some-article',  // これは含まれるべき
  'https://example.com/tag/something',  // これは除外されるべき
  'https://example.com/category/something',  // これは除外されるべき
];

console.log('=== isArticleUrl関数のテスト ===\n');

testUrls.forEach(url => {
  const result = isArticleUrl(url);
  const status = result ? '✓ INCLUDED' : '✗ EXCLUDED';
  console.log(`${status}: ${url}`);
  
  // pathnameを表示
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    console.log(`  Pathname: ${pathname}`);
  } catch (e) {
    console.log(`  Pathname: (parse error)`);
  }
  console.log('');
});

console.log('\n=== テスト完了 ===');

