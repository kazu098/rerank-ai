import { createSupabaseClient } from '@/lib/supabase';

export interface Article {
  id: string;
  user_id: string;
  site_id: string | null;
  url: string;
  title: string | null;
  keywords: string[] | null;
  is_monitoring: boolean;
  monitoring_frequency: string;
  last_analyzed_at: string | null;
  last_rank_drop_at: string | null;
  current_average_position: number | null;
  previous_average_position: number | null;
  is_fixed: boolean | null;
  fixed_at: string | null;
  fixed_notification_id: string | null;
  last_notification_sent_at: string | null;
  notification_count_last_7_days: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * 記事を登録または更新
 */
export async function saveOrUpdateArticle(
  userId: string,
  url: string,
  siteId?: string | null,
  title?: string,
  keywords?: string[]
): Promise<Article> {
  const supabase = createSupabaseClient();

  // 既存の記事を検索
  const { data: existingArticle } = await supabase
    .from('articles')
    .select('*')
    .eq('user_id', userId)
    .eq('url', url)
    .is('deleted_at', null)
    .single();

  if (existingArticle) {
    // 更新
    const { data: updatedArticle, error } = await supabase
      .from('articles')
      .update({
        site_id: siteId || existingArticle.site_id,
        title: title || existingArticle.title,
        keywords: keywords || existingArticle.keywords,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingArticle.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update article: ${error.message}`);
    }

    return updatedArticle as Article;
  }

  // 新規作成
  const { data: newArticle, error } = await supabase
    .from('articles')
    .insert({
      user_id: userId,
      site_id: siteId || null,
      url,
      title: title || null,
      keywords: keywords || null,
      is_monitoring: true,
      monitoring_frequency: 'daily',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create article: ${error.message}`);
  }

  return newArticle as Article;
}

/**
 * ユーザーの記事一覧を取得
 */
export async function getArticlesByUserId(
  userId: string,
  includeDeleted: boolean = false
): Promise<Article[]> {
  const supabase = createSupabaseClient();

  let query = supabase
    .from('articles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get articles: ${error.message}`);
  }

  return (data || []) as Article[];
}

/**
 * 監視対象の記事一覧を取得（Cron用）
 */
export async function getMonitoringArticles(): Promise<Article[]> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('is_monitoring', true)
    .is('deleted_at', null)
    .order('last_analyzed_at', { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Failed to get monitoring articles: ${error.message}`);
  }

  return (data || []) as Article[];
}

/**
 * 記事IDから記事情報を取得
 */
export async function getArticleById(articleId: string): Promise<Article | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', articleId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get article: ${error.message}`);
  }

  return data as Article;
}

/**
 * 記事の分析結果を更新
 */
export async function updateArticleAnalysis(
  articleId: string,
  averagePosition: number,
  previousAveragePosition?: number
): Promise<void> {
  const supabase = createSupabaseClient();

  const updateData: any = {
    current_average_position: averagePosition,
    last_analyzed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (previousAveragePosition !== undefined) {
    updateData.previous_average_position = previousAveragePosition;
  }

  const { error } = await supabase
    .from('articles')
    .update(updateData)
    .eq('id', articleId);

  if (error) {
    throw new Error(`Failed to update article analysis: ${error.message}`);
  }
}

/**
 * 記事の通知送信日時を更新
 */
export async function updateArticleNotificationSent(
  articleUrl: string,
  userId: string
): Promise<void> {
  const supabase = createSupabaseClient();

  // まず現在の値を取得
  const { data: article } = await supabase
    .from('articles')
    .select('notification_count_last_7_days')
    .eq('url', articleUrl)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  const currentCount = article?.notification_count_last_7_days || 0;

  const { error } = await supabase
    .from('articles')
    .update({
      last_notification_sent_at: new Date().toISOString(),
      notification_count_last_7_days: currentCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('url', articleUrl)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to update article notification sent: ${error.message}`);
  }
}

/**
 * 記事の順位下落を記録
 */
export async function recordRankDrop(articleId: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('articles')
    .update({
      last_rank_drop_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId);

  if (error) {
    throw new Error(`Failed to record rank drop: ${error.message}`);
  }
}

/**
 * 記事を削除（ソフトデリート）
 */
export async function deleteArticle(articleId: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('articles')
    .update({
      deleted_at: new Date().toISOString(),
      is_monitoring: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId);

  if (error) {
    throw new Error(`Failed to delete article: ${error.message}`);
  }
}

/**
 * サイトIDで記事一覧を取得
 */
export async function getArticlesBySiteId(
  siteId: string,
  includeDeleted: boolean = false
): Promise<Article[]> {
  const supabase = createSupabaseClient();

  let query = supabase
    .from('articles')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get articles by site ID: ${error.message}`);
  }

  return (data || []) as Article[];
}

/**
 * URLで記事を検索（タイトル取得済みかどうかを確認）
 */
export async function getArticleByUrl(
  userId: string,
  url: string
): Promise<Article | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('user_id', userId)
    .eq('url', url)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get article by URL: ${error.message}`);
  }

  return data as Article;
}


