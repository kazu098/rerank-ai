import { createSupabaseClient } from "@/lib/supabase";

export interface Notification {
  id: string;
  user_id: string;
  article_id: string;
  analysis_result_id: string | null;
  notification_type: string;
  channel: string;
  recipient: string;
  subject: string | null;
  summary: string | null;
  detail_report_url: string | null;
  detail_report_expires_at: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  article?: {
    id: string;
    url: string;
    title: string | null;
  };
  analysis_result?: {
    id: string;
    average_position: number | null;
    position_change: number | null;
  };
}

/**
 * ユーザーの通知一覧を取得
 */
export async function getNotificationsByUserId(
  userId: string,
  options?: {
    read?: boolean | null; // true: 既読のみ, false: 未読のみ, null: すべて
    limit?: number;
    offset?: number;
  }
): Promise<Notification[]> {
  const supabase = createSupabaseClient();

  let query = supabase
    .from("notifications")
    .select(`
      *,
      article:articles!notifications_article_id_fkey(id, url, title),
      analysis_result:analysis_results(id, average_position, position_change)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (options?.read !== undefined && options.read !== null) {
    if (options.read) {
      query = query.not("read_at", "is", null);
    } else {
      query = query.is("read_at", null);
    }
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get notifications: ${error.message}`);
  }

  return (data || []) as Notification[];
}

/**
 * 通知を既読にする
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);

  if (error) {
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
}

/**
 * 通知IDから通知を取得
 */
export async function getNotificationById(notificationId: string): Promise<Notification | null> {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(`
      *,
      article:articles!notifications_article_id_fkey(id, url, title),
      analysis_result:analysis_results(id, average_position, position_change)
    `)
    .eq("id", notificationId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to get notification: ${error.message}`);
  }

  return data as Notification;
}

