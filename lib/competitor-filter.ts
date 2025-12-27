/**
 * 競合サイトフィルタリング機能
 * 分析対象から除外すべきサイトを判定する
 */

/**
 * グローバル除外リスト（常に除外、設定不可）
 * これらのサイトは記事分析の対象外
 */
const GLOBAL_EXCLUDED_DOMAINS = [
  // Wikipedia
  'wikipedia.org',
  'wikipedia.com',
  
  // ソーシャルメディア
  'twitter.com',
  'x.com', // Twitterの新ドメイン
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'pinterest.com',
  
  // 動画サイト
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  
  // 検索エンジン
  'google.com',
  'google.co.jp',
  'bing.com',
  'yahoo.co.jp', // Yahoo!検索ページ（メディアサイトは含める）
  'yahoo.com',
  
  // 画像サイト
  'imgur.com',
  'flickr.com',
];

/**
 * デフォルト除外リスト（デフォルトで除外、設定で解除可能）
 * これらのサイトは実現不可能な改善案が生成される可能性があるため、デフォルトで除外
 */
const DEFAULT_EXCLUDED_DOMAINS = [
  // 大手ECサイト
  'amazon.co.jp',
  'amazon.com',
  'rakuten.co.jp',
  'rakuten.com',
  'yahoo.co.jp', // Yahoo!ショッピング（検索エンジンと重複するが、ショッピングページを除外）
];

/**
 * ドメインを抽出（URLから）
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, ''); // www.を除去
  } catch {
    // URLパースに失敗した場合、そのまま返す
    return url;
  }
}

/**
 * ドメインが除外リストに含まれているかチェック
 */
function isDomainExcluded(domain: string, excludedDomains: string[]): boolean {
  const normalizedDomain = domain.toLowerCase();
  
  // 完全一致
  if (excludedDomains.includes(normalizedDomain)) {
    return true;
  }
  
  // サブドメインのチェック（例: www.amazon.co.jp → amazon.co.jp）
  const parts = normalizedDomain.split('.');
  for (let i = 0; i < parts.length; i++) {
    const domainWithoutSubdomain = parts.slice(i).join('.');
    if (excludedDomains.includes(domainWithoutSubdomain)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 自社サイトのドメインと一致するかチェック
 */
function isOwnSite(competitorUrl: string, ownSiteUrl: string): boolean {
  if (!ownSiteUrl) {
    return false;
  }
  
  try {
    const competitorDomain = extractDomain(competitorUrl);
    const ownDomain = extractDomain(ownSiteUrl);
    
    // 完全一致
    if (competitorDomain === ownDomain) {
      return true;
    }
    
    // サブドメインのチェック（例: blog.example.com と example.com）
    const competitorParts = competitorDomain.split('.');
    const ownParts = ownDomain.split('.');
    
    // 自社サイトのドメインが競合URLのサブドメインとして含まれているか
    if (competitorParts.length > ownParts.length) {
      const competitorBaseDomain = competitorParts.slice(-ownParts.length).join('.');
      if (competitorBaseDomain === ownDomain) {
        return true;
      }
    }
    
    // 競合URLのドメインが自社サイトのサブドメインとして含まれているか
    if (ownParts.length > competitorParts.length) {
      const ownBaseDomain = ownParts.slice(-competitorParts.length).join('.');
      if (ownBaseDomain === competitorDomain) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

export interface FilterOptions {
  /**
   * グローバル除外を有効にする（デフォルト: true）
   */
  useGlobalExclusion?: boolean;
  
  /**
   * デフォルト除外を有効にする（デフォルト: true）
   */
  useDefaultExclusion?: boolean;
  
  /**
   * 自社サイトのURL（自社サイトを除外するために使用）
   */
  ownSiteUrl?: string;
  
  /**
   * カスタム除外ドメインリスト（ユーザーが追加した除外リスト）
   */
  customExcludedDomains?: string[];
}

/**
 * 競合URLをフィルタリング
 * @param competitorUrls 競合URLのリスト
 * @param options フィルタリングオプション
 * @returns フィルタリング後の競合URLリストと除外されたURLの情報
 */
export function filterCompetitorUrls(
  competitorUrls: string[],
  options: FilterOptions = {}
): {
  filteredUrls: string[];
  excludedUrls: Array<{
    url: string;
    reason: 'global' | 'default' | 'custom' | 'own_site';
    domain: string;
  }>;
} {
  const {
    useGlobalExclusion = true,
    useDefaultExclusion = true,
    ownSiteUrl,
    customExcludedDomains = [],
  } = options;

  const filteredUrls: string[] = [];
  const excludedUrls: Array<{
    url: string;
    reason: 'global' | 'default' | 'custom' | 'own_site';
    domain: string;
  }> = [];

  for (const url of competitorUrls) {
    const domain = extractDomain(url);
    let excluded = false;
    let reason: 'global' | 'default' | 'custom' | 'own_site' = 'global';

    // グローバル除外チェック
    if (useGlobalExclusion && isDomainExcluded(domain, GLOBAL_EXCLUDED_DOMAINS)) {
      excluded = true;
      reason = 'global';
    }

    // デフォルト除外チェック
    if (!excluded && useDefaultExclusion && isDomainExcluded(domain, DEFAULT_EXCLUDED_DOMAINS)) {
      excluded = true;
      reason = 'default';
    }

    // カスタム除外チェック
    if (!excluded && customExcludedDomains.length > 0 && isDomainExcluded(domain, customExcludedDomains)) {
      excluded = true;
      reason = 'custom';
    }

    // 自社サイトチェック
    if (!excluded && ownSiteUrl && isOwnSite(url, ownSiteUrl)) {
      excluded = true;
      reason = 'own_site';
    }

    if (excluded) {
      excludedUrls.push({ url, reason, domain });
    } else {
      filteredUrls.push(url);
    }
  }

  return { filteredUrls, excludedUrls };
}

/**
 * 除外理由を説明するメッセージを取得（多言語対応）
 */
export function getExclusionReasonMessage(
  reason: 'global' | 'default' | 'custom' | 'own_site',
  locale: 'ja' | 'en' = 'ja'
): string {
  const messages = {
    ja: {
      global: 'システム除外（Wikipedia、ソーシャルメディア、動画サイト等）',
      default: 'デフォルト除外（大手ECサイト等）',
      custom: 'ユーザー設定による除外',
      own_site: '自社サイトのため除外',
    },
    en: {
      global: 'System exclusion (Wikipedia, social media, video sites, etc.)',
      default: 'Default exclusion (major e-commerce sites, etc.)',
      custom: 'Excluded by user settings',
      own_site: 'Excluded (own site)',
    },
  };

  return messages[locale][reason];
}

/**
 * グローバル除外ドメインリストを取得（設定画面表示用）
 */
export function getGlobalExcludedDomains(): string[] {
  return [...GLOBAL_EXCLUDED_DOMAINS];
}

/**
 * デフォルト除外ドメインリストを取得（設定画面表示用）
 */
export function getDefaultExcludedDomains(): string[] {
  return [...DEFAULT_EXCLUDED_DOMAINS];
}

