import { createSupabaseClient } from "@/lib/supabase";
import { ArticleSuggestion } from "@/lib/article-suggestion";

export interface ArticleSuggestionRecord {
  id: string;
  user_id: string;
  site_id: string;
  title: string;
  keywords: string[];
  outline?: string[] | null;
  reason: string | null;
  estimated_impressions: number | null;
  priority: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * 記事提案を保存
 */
export async function saveArticleSuggestions(
  userId: string,
  siteId: string,
  suggestions: ArticleSuggestion[]
): Promise<ArticleSuggestionRecord[]> {
  const supabase = createSupabaseClient();

  const records = suggestions.map((suggestion) => ({
    user_id: userId,
    site_id: siteId,
    title: suggestion.title,
    keywords: suggestion.keywords,
    outline: suggestion.outline || null,
    reason: suggestion.reason || null,
    estimated_impressions: suggestion.estimatedImpressions || null,
    priority: suggestion.priority,
    status: "pending" as const,
  }));

  const { data, error } = await supabase
    .from("article_suggestions")
    .insert(records)
    .select();

  if (error) {
    throw new Error(`Failed to save article suggestions: ${error.message}`);
  }

  return data as ArticleSuggestionRecord[];
}

/**
 * ユーザーの記事提案一覧を取得
 */
export async function getArticleSuggestionsByUserId(
  userId: string,
  siteId?: string,
  status?: "pending" | "in_progress" | "completed" | "skipped"
): Promise<ArticleSuggestionRecord[]> {
  const supabase = createSupabaseClient();

  let query = supabase
    .from("article_suggestions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Failed to get article suggestions: ${error.message}`
    );
  }

  return (data || []) as ArticleSuggestionRecord[];
}

/**
 * 記事提案のステータスを更新
 */
export async function updateArticleSuggestionStatus(
  suggestionId: string,
  status: "pending" | "in_progress" | "completed" | "skipped"
): Promise<ArticleSuggestionRecord> {
  const supabase = createSupabaseClient();

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("article_suggestions")
    .update(updateData)
    .eq("id", suggestionId)
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to update article suggestion status: ${error.message}`
    );
  }

  return data as ArticleSuggestionRecord;
}

