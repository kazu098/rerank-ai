import { createSupabaseClient } from '@/lib/supabase';

/**
 * サイトURLを正規化（https://形式に統一）
 * sc-domain:形式をhttps://形式に変換
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

export interface Site {
  id: string;
  user_id: string;
  site_url: string;
  display_name: string | null;
  gsc_access_token: string | null;
  gsc_refresh_token: string | null;
  gsc_token_expires_at: string | null;
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
  refreshToken: string,
  expiresAt: Date,
  displayName?: string
): Promise<Site> {
  const supabase = createSupabaseClient();

  // URLを正規化（https://形式に統一）
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);

  // 既存のサイトを検索（正規化前後の両方の形式で検索）
  // まず元のURLで検索
  let { data: existingSite } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .eq('site_url', siteUrl)
    .single();
  
  // 見つからない場合は正規化されたURLで検索
  if (!existingSite && siteUrl !== normalizedSiteUrl) {
    const { data } = await supabase
      .from('sites')
      .select('*')
      .eq('user_id', userId)
      .eq('site_url', normalizedSiteUrl)
      .single();
    existingSite = data;
  }

  if (existingSite) {
    // 更新（URLも正規化して更新）
    const { data: updatedSite, error } = await supabase
      .from('sites')
      .update({
        site_url: normalizedSiteUrl, // 正規化されたURLに更新
        gsc_access_token: accessToken,
        gsc_refresh_token: refreshToken,
        gsc_token_expires_at: expiresAt.toISOString(),
        display_name: displayName || existingSite.display_name,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingSite.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update site: ${error.message}`);
    }

    return updatedSite as Site;
  }

  // 新規作成（正規化されたURLで保存）
  const { data: newSite, error } = await supabase
    .from('sites')
    .insert({
      user_id: userId,
      site_url: normalizedSiteUrl, // 正規化されたURLで保存
      display_name: displayName || normalizedSiteUrl,
      gsc_access_token: accessToken,
      gsc_refresh_token: refreshToken,
      gsc_token_expires_at: expiresAt.toISOString(),
      is_active: true,
      is_trial: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create site: ${error.message}`);
  }

  return newSite as Site;
}

/**
 * ユーザーのサイト一覧を取得
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

  // 取得したサイトのURLを正規化して返す
  return (data || []).map((site: Site) => ({
    ...site,
    site_url: normalizeSiteUrl(site.site_url),
  })) as Site[];
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
  expiresAt: Date
): Promise<void> {
  const supabase = createSupabaseClient();

  const updateData: {
    gsc_access_token: string;
    gsc_refresh_token?: string | null;
    gsc_token_expires_at: string;
    updated_at: string;
  } = {
    gsc_access_token: accessToken,
    gsc_token_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  };

  // リフレッシュトークンが提供されている場合のみ更新
  if (refreshToken !== null) {
    updateData.gsc_refresh_token = refreshToken;
  }

  const { error } = await supabase
    .from('sites')
    .update(updateData)
    .eq('id', siteId);

  if (error) {
    throw new Error(`Failed to update site tokens: ${error.message}`);
  }
}


