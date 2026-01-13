import { createSupabaseClient } from '@/lib/supabase';

/**
 * サイトURLからドメインを抽出
 * @param siteUrl - サイトURL（https://example.com/, sc-domain:example.com など）
 * @returns ドメイン名（www.は除去）
 */
function extractDomainFromSiteUrl(siteUrl: string): string {
  try {
    // sc-domain:形式の場合
    if (siteUrl.startsWith("sc-domain:")) {
      const domain = siteUrl.replace("sc-domain:", "");
      return domain.replace(/^www\./, ""); // www.を除去
    }
    
    // URL形式の場合
    const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, ""); // www.を除去
  } catch {
    // URLパースに失敗した場合、そのまま返す
    return siteUrl.replace(/^www\./, "");
  }
}

/**
 * サイトURLを正規化（https://形式に統一）
 * sc-domain:形式をhttps://形式に変換
 * @deprecated この関数は重複チェック用の比較関数としてのみ使用してください。
 *             サイト保存時はURLをそのまま保存します。
 */
function normalizeSiteUrl(siteUrl: string): string {
  // 既にhttps://形式の場合はそのまま返す
  if (siteUrl.startsWith("https://")) {
    return siteUrl;
  }
  
  // sc-domain:形式をhttps://形式に変換
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.replace("sc-domain:", "");
    return `https://${domain}/`;
  }
  
  // http://形式をhttps://形式に変換
  if (siteUrl.startsWith("http://")) {
    return siteUrl.replace("http://", "https://");
  }
  
  // その他の場合はhttps://を追加
  if (!siteUrl.startsWith("http")) {
    return `https://${siteUrl}/`;
  }
  
  return siteUrl;
}

/**
 * サイトURLを正規化して比較用のドメインを抽出（重複チェック用）
 * sc-domain:形式とhttps://形式を同じドメインとして扱う
 */
function normalizeSiteUrlForComparison(url: string): string {
  try {
    // sc-domain:形式の場合
    if (url.startsWith("sc-domain:")) {
      const domain = url.replace("sc-domain:", "");
      return domain.replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
    }
    
    // URL形式の場合
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // URLパースに失敗した場合、単純に正規化
    return url.replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
  }
}

export interface Site {
  id: string;
  user_id: string;
  site_url: string;
  display_name: string | null;
  gsc_access_token: string | null;
  gsc_refresh_token: string | null;
  gsc_token_expires_at: string | null;
  auth_error_at: string | null; // 認証エラーが発生した時刻（24時間以内の重複通知を防ぐため）
  is_active: boolean;
  is_trial: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GSC連携情報を保存または更新
 * 注意: トークンは暗号化せずに保存（本番環境では暗号化必須）
 */
export async function saveOrUpdateSite(
  userId: string,
  siteUrl: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date,
  displayName?: string
): Promise<Site> {
  const supabase = createSupabaseClient();

  // URLをそのまま保存（sc-domain:形式も保持）
  // 既存サイトの検索は比較用の正規化関数を使用
  const normalizedForComparison = normalizeSiteUrlForComparison(siteUrl);
  
  // 既存のサイトを検索（比較用正規化で同じドメインかチェック）
  const { data: allSites } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  
  // 比較用正規化で同じドメインのサイトを全て検索
  const matchingSites = (allSites || []).filter(s => {
    const normalizedExisting = normalizeSiteUrlForComparison(s.site_url);
    return normalizedExisting === normalizedForComparison;
  });
  
  // sc-domain: 形式のサイトを優先して選択（GSC APIで403エラーが発生しにくい）
  let existingSite = matchingSites.find(s => s.site_url.startsWith("sc-domain:"));
  if (!existingSite && matchingSites.length > 0) {
    existingSite = matchingSites[0];
  }
  
  // 重複エントリがある場合、選択されなかったエントリを非アクティブにする
  if (matchingSites.length > 1 && existingSite) {
    const duplicateSites = matchingSites.filter(s => s.id !== existingSite!.id);
    for (const dupSite of duplicateSites) {
      console.log(`[Sites DB] Deactivating duplicate site entry: ${dupSite.id} (${dupSite.site_url}), keeping: ${existingSite.id} (${existingSite.site_url})`);
      await supabase
        .from('sites')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dupSite.id);
    }
  }

  if (existingSite) {
    // 更新（既存のsite_urlを保持してユニーク制約違反を防ぐ）
    // リフレッシュトークンが空文字列の場合は、既存のリフレッシュトークンを保持
    const updateData: {
      gsc_access_token: string;
      gsc_refresh_token?: string | null;
      gsc_token_expires_at: string;
      display_name?: string;
      is_active: boolean;
      updated_at: string;
    } = {
      gsc_access_token: accessToken,
      gsc_token_expires_at: expiresAt.toISOString(),
      display_name: displayName || existingSite.display_name,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // リフレッシュトークンの更新処理
    console.log("[Sites DB] Refresh token update logic:", {
      refreshTokenProvided: refreshToken ? `${refreshToken.substring(0, 20)}...` : 'null',
      refreshTokenLength: refreshToken?.length || 0,
      existingRefreshToken: existingSite.gsc_refresh_token ? `${existingSite.gsc_refresh_token.substring(0, 20)}...` : 'null',
      existingRefreshTokenLength: existingSite.gsc_refresh_token?.length || 0,
    });
    
    // 新しいリフレッシュトークンが有効な値の場合は更新
    if (refreshToken && refreshToken.trim() !== '') {
      updateData.gsc_refresh_token = refreshToken;
      console.log("[Sites DB] Will update with new refresh token");
    } 
    // 新しいリフレッシュトークンがnullの場合でも、既存のリフレッシュトークンが有効な場合は保持
    else if (existingSite.gsc_refresh_token && existingSite.gsc_refresh_token.trim() !== '') {
      updateData.gsc_refresh_token = existingSite.gsc_refresh_token;
      console.log("[Sites DB] Will keep existing refresh token");
    }
    // 新しいリフレッシュトークンがnullで、既存もnull/空文字列の場合は、明示的にnullを設定（再認証時にnullを保存するため）
    else {
      updateData.gsc_refresh_token = null;
      console.log("[Sites DB] Will set refresh token to null");
    }
    
    console.log("[Sites DB] Final updateData.gsc_refresh_token:", updateData.gsc_refresh_token ? `${updateData.gsc_refresh_token.substring(0, 20)}...` : 'null');

    const { data: updatedSite, error } = await supabase
      .from('sites')
      .update(updateData)
      .eq('id', existingSite.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update site: ${error.message}`);
    }

    return updatedSite as Site;
  }

  // 新規作成（ユーザーが選択した形式をそのまま保存、sc-domain:形式も保持）
  // リフレッシュトークンが空文字列の場合はnullとして保存
  const insertData: {
    user_id: string;
    site_url: string;
    display_name: string;
    gsc_access_token: string;
    gsc_refresh_token: string | null;
    gsc_token_expires_at: string;
    is_active: boolean;
    is_trial: boolean;
  } = {
    user_id: userId,
    site_url: siteUrl, // ユーザーが選択した形式をそのまま保存（sc-domain:形式も保持）
    display_name: displayName || siteUrl,
    gsc_access_token: accessToken,
    gsc_refresh_token: (refreshToken && refreshToken.trim() !== '') ? refreshToken : null,
    gsc_token_expires_at: expiresAt.toISOString(),
    is_active: true,
    is_trial: false,
  };

  const { data: newSite, error } = await supabase
    .from('sites')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create site: ${error.message}`);
  }

  return newSite as Site;
}

/**
 * ユーザーのサイト一覧を取得
 * 既存の重複エントリ（同じドメインで sc-domain: と https:// の両方がある場合）を自動的に統合
 */
export async function getSitesByUserId(userId: string): Promise<Site[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get sites: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // 重複エントリを検出して統合
  const domainMap = new Map<string, Site>();
  const duplicatesToDeactivate: Site[] = [];

  for (const site of data as Site[]) {
    const normalizedDomain = normalizeSiteUrlForComparison(site.site_url);
    const existing = domainMap.get(normalizedDomain);

    if (!existing) {
      // 初めてのドメイン
      domainMap.set(normalizedDomain, site);
    } else if (site.site_url.startsWith("sc-domain:") && !existing.site_url.startsWith("sc-domain:")) {
      // sc-domain: 形式を優先（既存の https:// 形式を非アクティブ化対象に追加）
      duplicatesToDeactivate.push(existing);
      domainMap.set(normalizedDomain, site);
    } else if (!site.site_url.startsWith("sc-domain:") && existing.site_url.startsWith("sc-domain:")) {
      // 既に sc-domain: 形式がある場合、https:// 形式を非アクティブ化対象に追加
      duplicatesToDeactivate.push(site);
    } else {
      // 同じ形式の重複（通常は発生しないが、念のため）
      // より古いエントリを非アクティブ化対象に追加
      const existingDate = new Date(existing.created_at);
      const currentDate = new Date(site.created_at);
      if (currentDate < existingDate) {
        duplicatesToDeactivate.push(site);
      } else {
        duplicatesToDeactivate.push(existing);
        domainMap.set(normalizedDomain, site);
      }
    }
  }

  // 重複エントリを非アクティブ化（非同期で実行、エラーはログのみ）
  if (duplicatesToDeactivate.length > 0) {
    console.log(`[getSitesByUserId] Found ${duplicatesToDeactivate.length} duplicate site entries for user ${userId}, deactivating...`);
    
    // 非同期で非アクティブ化（パフォーマンスへの影響を最小化）
    Promise.all(
      duplicatesToDeactivate.map(async (dupSite) => {
        try {
          await supabase
            .from('sites')
            .update({
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dupSite.id);
          console.log(`[getSitesByUserId] Deactivated duplicate site: ${dupSite.id} (${dupSite.site_url})`);
        } catch (err: any) {
          console.error(`[getSitesByUserId] Failed to deactivate duplicate site ${dupSite.id}:`, err.message);
        }
      })
    ).catch((err) => {
      console.error(`[getSitesByUserId] Error deactivating duplicate sites:`, err);
    });
  }

  // 統合されたサイト一覧を返す（sc-domain: 形式を優先）
  return Array.from(domainMap.values());
}

/**
 * サイトIDからサイト情報を取得
 */
export async function getSiteById(siteId: string): Promise<Site | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get site: ${error.message}`);
  }

  return data as Site;
}

/**
 * サイトの連携を解除（is_activeをfalseに）
 */
export async function deactivateSite(siteId: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('sites')
    .update({
      is_active: false,
      gsc_access_token: null,
      gsc_refresh_token: null,
      gsc_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId);

  if (error) {
    throw new Error(`Failed to deactivate site: ${error.message}`);
  }
}

/**
 * サイトのGSCトークンを更新
 */
export async function updateSiteTokens(
  siteId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date,
  clearAuthError: boolean = true
): Promise<void> {
  const supabase = createSupabaseClient();

  const updateData: {
    gsc_access_token: string;
    gsc_refresh_token?: string | null;
    gsc_token_expires_at: string;
    updated_at: string;
    auth_error_at?: string | null;
  } = {
    gsc_access_token: accessToken,
    gsc_token_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  };

  // リフレッシュトークンが提供されている場合のみ更新
  if (refreshToken !== null) {
    updateData.gsc_refresh_token = refreshToken;
  }

  // 認証エラーをクリア（再認証が成功した場合）
  if (clearAuthError) {
    updateData.auth_error_at = null;
  }

  const { error } = await supabase
    .from('sites')
    .update(updateData)
    .eq('id', siteId);

  if (error) {
    throw new Error(`Failed to update site tokens: ${error.message}`);
  }
}

/**
 * サイトの認証エラー時刻を更新
 */
export async function updateSiteAuthError(siteId: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('sites')
    .update({
      auth_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId);

  if (error) {
    throw new Error(`Failed to update site auth error: ${error.message}`);
  }
}

/**
 * URLプロパティ形式（https://example.com/）からドメインプロパティ形式（sc-domain:example.com）に変換
 */
export function convertUrlPropertyToDomainProperty(urlProperty: string): string | null {
  try {
    // すでにドメインプロパティ形式の場合はnullを返す
    if (urlProperty.startsWith('sc-domain:')) {
      return null;
    }
    
    // URLプロパティ形式の場合のみ変換
    if (urlProperty.startsWith('https://') || urlProperty.startsWith('http://')) {
      const urlObj = new URL(urlProperty);
      const domain = urlObj.hostname.replace(/^www\./, '');
      return `sc-domain:${domain}`;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * サイトのURLを更新
 * 重複エントリがある場合は、古いエントリを非アクティブにしてから更新
 */
export async function updateSiteUrl(siteId: string, newSiteUrl: string): Promise<void> {
  const supabase = createSupabaseClient();

  // まず、更新対象のサイト情報を取得
  const { data: currentSite, error: getSiteError } = await supabase
    .from('sites')
    .select('user_id, site_url')
    .eq('id', siteId)
    .single();

  if (getSiteError) {
    throw new Error(`Failed to get site info: ${getSiteError.message}`);
  }

  // 同じユーザーで同じURLを持つ別のサイトが存在するかチェック
  const { data: duplicateSites, error: dupCheckError } = await supabase
    .from('sites')
    .select('id, site_url')
    .eq('user_id', currentSite.user_id)
    .eq('site_url', newSiteUrl)
    .eq('is_active', true)
    .neq('id', siteId);

  if (dupCheckError) {
    throw new Error(`Failed to check duplicate sites: ${dupCheckError.message}`);
  }

  // 重複エントリがある場合は、現在のサイトを非アクティブにして重複エントリを使用
  if (duplicateSites && duplicateSites.length > 0) {
    console.log(`[updateSiteUrl] Found duplicate site with URL ${newSiteUrl}, deactivating current site ${siteId} and keeping existing site ${duplicateSites[0].id}`);
    
    // 現在のサイト（古いURL）を非アクティブにする
    const { error: deactivateError } = await supabase
      .from('sites')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', siteId);

    if (deactivateError) {
      console.error(`[updateSiteUrl] Failed to deactivate site: ${deactivateError.message}`);
      // エラーが発生しても処理は続行（重複エントリが存在するため、GSC APIは成功している）
    }
    
    return; // 重複エントリを使用するため、更新は不要
  }

  // 重複がない場合は通常の更新を実行
  const { error } = await supabase
    .from('sites')
    .update({
      site_url: newSiteUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId);

  if (error) {
    // ユニーク制約違反の場合は警告のみ（GSC APIは成功しているため）
    if (error.code === '23505') {
      console.warn(`[updateSiteUrl] Unique constraint violation when updating site URL to ${newSiteUrl}. GSC API succeeded, continuing...`);
      return;
    }
    throw new Error(`Failed to update site URL: ${error.message}`);
  }
}

/**
 * ユーザーが実際に分析を実行したドメイン数を取得
 * analysis_runs → articles → sites を経由してドメインを集計
 */
export async function getAnalyzedDomainCountByUserId(userId: string): Promise<number> {
  const supabase = createSupabaseClient();

  // まず、ユーザーの記事でsite_idが設定されているものを取得
  const { data: userArticles, error: articlesError } = await supabase
    .from('articles')
    .select('id, site_id')
    .eq('user_id', userId)
    .not('site_id', 'is', null)
    .is('deleted_at', null);

  if (articlesError) {
    console.error('[getAnalyzedDomainCountByUserId] Error fetching articles:', articlesError);
    throw new Error(`Failed to get analyzed domain count: ${articlesError.message}`);
  }

  if (!userArticles || userArticles.length === 0) {
    return 0;
  }

  const articleIds = userArticles.map((a) => a.id);

  // これらの記事に関連するanalysis_runsを取得
  const { data: analyses, error: analysesError } = await supabase
    .from('analysis_runs')
    .select('article_id')
    .in('article_id', articleIds);

  if (analysesError) {
    console.error('[getAnalyzedDomainCountByUserId] Error fetching analyses:', analysesError);
    throw new Error(`Failed to get analyzed domain count: ${analysesError.message}`);
  }

  if (!analyses || analyses.length === 0) {
    return 0;
  }

  // 分析が実行された記事のsite_idを取得
  const analyzedSiteIds = new Set<string>();
  for (const analysis of analyses) {
    const article = userArticles.find((a) => a.id === analysis.article_id);
    if (article?.site_id) {
      analyzedSiteIds.add(article.site_id);
    }
  }

  if (analyzedSiteIds.size === 0) {
    return 0;
  }

  // site_idからsite_urlを取得
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select('site_url')
    .in('id', Array.from(analyzedSiteIds));

  if (sitesError) {
    console.error('[getAnalyzedDomainCountByUserId] Error fetching sites:', sitesError);
    throw new Error(`Failed to get analyzed domain count: ${sitesError.message}`);
  }

  if (!sites || sites.length === 0) {
    return 0;
  }

  // ドメインを抽出してユニークにする
  const domains = new Set<string>();
  for (const site of sites) {
    if (site.site_url) {
      const domain = extractDomainFromSiteUrl(site.site_url);
      domains.add(domain);
    }
  }

  console.log('[getAnalyzedDomainCountByUserId] Result:', {
    userId,
    analyzedSiteIds: analyzedSiteIds.size,
    sitesCount: sites.length,
    uniqueDomains: domains.size,
    domains: Array.from(domains),
  });

  return domains.size;
}


