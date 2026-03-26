import { supabase } from "../../utils/supabase/client";

export type AppNotification = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  status: string;
};

function normalizeNotification(row: Record<string, any>): AppNotification {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    subject: String(row.subject ?? "Notification"),
    message: String(row.message ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    status: String(row.status ?? "pending"),
  };
}

export async function loadUserNotifications(limit = 20): Promise<AppNotification[]> {
  const authRes = await supabase.auth.getUser();
  if (authRes.error) throw authRes.error;

  const userId = authRes.data.user?.id;
  let query = supabase
    .from("notification_outbox")
    .select("id,subject,message,created_at,status,user_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  } else {
    query = query.is("user_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => normalizeNotification(row as Record<string, any>));
}
