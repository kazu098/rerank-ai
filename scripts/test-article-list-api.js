/**
 * 記事一覧APIのテストスクリプト
 * 実際のGSC APIレスポンスを確認して、問題を特定
 */

// このスクリプトは認証が必要なので、実際にはブラウザで実行する必要があります
// 代わりに、コードのロジックを検証します

console.log('=== 記事一覧APIのロジック検証 ===\n');

// テストケース: GSC APIから返される可能性のあるURL形式
const testCases = [
  {
    description: 'sc-domain: 形式、相対パス（先頭スラッシュあり）',
    siteUrl: 'sc-domain:mia-kit.com',
    pageUrl: '/ja/store-app/articles/chatbot-dounyuu-shippai',
    expected: 'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai'
  },
  {
    description: 'sc-domain: 形式、相対パス（先頭スラッシュなし）',
    siteUrl: 'sc-domain:mia-kit.com',
    pageUrl: 'ja/store-app/articles/chatbot-dounyuu-shippai',
    expected: 'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai'
  },
  {
    description: 'sc-domain: 形式、完全URL',
    siteUrl: 'sc-domain:mia-kit.com',
    pageUrl: 'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai',
    expected: 'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai'
  },
  {
    description: 'sc-domain: 形式、末尾スラッシュあり',
    siteUrl: 'sc-domain:mia-kit.com',
    pageUrl: '/ja/store-app/articles/chatbot-dounyuu-shippai/',
    expected: 'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai/'
  },
  {
    description: 'https:// 形式、相対パス',
    siteUrl: 'https://mia-kit.com',
    pageUrl: '/ja/store-app/articles/chatbot-dounyuu-shippai',
    expected: 'https://mia-kit.com/ja/store-app/articles/chatbot-dounyuu-shippai'
  },
];

// URL変換ロジック（app/api/articles/list/route.tsから）
function convertPageUrl(siteUrl, pageUrl) {
  let fullUrl;
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.replace("sc-domain:", "");
    fullUrl = pageUrl.startsWith("http")
      ? pageUrl
      : `https://${domain}${pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`}`;
  } else {
    const siteUrlWithoutSlash = siteUrl.replace(/\/$/, "");
    fullUrl = pageUrl.startsWith("http")
      ? pageUrl
      : `${siteUrlWithoutSlash}${pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`}`;
  }
  return fullUrl;
}

// normalizeUrl関数
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

// isArticleUrl関数
function isArticleUrl(url) {
  const urlLower = url.toLowerCase();
  let pathname;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch (error) {
    return false;
  }
  
  const excludePatterns = [
    '/tag/', '/category/', '/wp-content/uploads/', '/author/',
    '/feed/', '/wp-json/', '/wp-admin/', '/wp-includes/',
    '/page/', '/search/', '/archive/',
  ];
  
  for (const pattern of excludePatterns) {
    if (pathname.includes(pattern)) {
      return false;
    }
  }
  
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp'];
  for (const ext of imageExtensions) {
    if (urlLower.endsWith(ext)) {
      return false;
    }
  }
  
  const fileExtensions = ['.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx', '.css', '.js'];
  for (const ext of fileExtensions) {
    if (urlLower.endsWith(ext)) {
      return false;
    }
  }
  
  return true;
}

console.log('URL変換ロジックのテスト:\n');
testCases.forEach((testCase, index) => {
  const result = convertPageUrl(testCase.siteUrl, testCase.pageUrl);
  const normalized = normalizeUrl(result);
  const isArticle = isArticleUrl(normalized);
  const match = normalized === normalizeUrl(testCase.expected);
  
  console.log(`Test ${index + 1}: ${testCase.description}`);
  console.log(`  Input: siteUrl=${testCase.siteUrl}, pageUrl=${testCase.pageUrl}`);
  console.log(`  Output: ${result}`);
  console.log(`  Normalized: ${normalized}`);
  console.log(`  Expected: ${testCase.expected}`);
  console.log(`  Match: ${match ? '✓' : '✗'}`);
  console.log(`  isArticleUrl: ${isArticle ? '✓ INCLUDED' : '✗ EXCLUDED'}`);
  console.log('');
});

console.log('\n=== 検証完了 ===');
console.log('\n注意: 実際のGSC APIレスポンスを確認するには、ブラウザで /ja/test-gsc にアクセスして');
console.log('「ページ一覧取得テスト」セクションでテストを実行してください。');

