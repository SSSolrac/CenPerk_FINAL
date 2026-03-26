import { supabase } from "../../utils/supabase/client";
import { loadMemberActivity } from "./loyalty-supabase";

export type StatementRow = {
  type: string;
  points: number;
  date: string;
  expiry_date: string | null;
  reason: string;
};

function parseLocalDateBoundary(dateStr: string, boundary: "start" | "end") {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return new Date(NaN);

  if (boundary === "start") {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

export async function generateStatementData(input: {
  memberId: string;
  memberEmail?: string;
  startDate: string;
  endDate: string;
}) {
  const start = parseLocalDateBoundary(input.startDate, "start");
  const end = parseLocalDateBoundary(input.endDate, "end");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid statement date range.");
  }
  if (end < start) throw new Error("End date must be on or after start date.");

  const activity = await loadMemberActivity(input.memberId, input.memberEmail);
  const history = activity.history
    .map((r) => ({ ...r, dateObj: new Date(r.date) }))
    .filter((r) => !Number.isNaN(r.dateObj.getTime()));

  const openingDelta = history
    .filter((tx) => tx.dateObj < start)
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

  const periodRows = history
    .filter((tx) => tx.dateObj >= start && tx.dateObj <= end)
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
    .map((tx) => ({
      type: tx.type,
      points: Number(tx.points || 0),
      date: tx.date,
      expiry_date: tx.expiry_date,
      reason: tx.reason,
    })) as StatementRow[];

  const currentBalance = Number(activity.balance.points_balance || 0);
  const openingBalance = currentBalance - (history.reduce((s, tx) => s + Number(tx.points || 0), 0) - openingDelta);
  const closingBalance = openingBalance + periodRows.reduce((sum, tx) => sum + tx.points, 0);

  return {
    openingBalance,
    closingBalance,
    rows: periodRows,
    generatedAt: new Date().toISOString(),
    tier: activity.balance.tier,
  };
}

export async function emailStatement(memberId: string, pdfBlob: Blob) {
  const fileName = `statement-${memberId}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const path = `statements/${memberId}/${fileName}`;

  const upload = await supabase.storage.from("statements").upload(path, pdfBlob, {
    upsert: true,
    contentType: "application/pdf",
  });
  if (upload.error) throw upload.error;

  const { data } = supabase.storage.from("statements").getPublicUrl(path);
  const statementUrl = data.publicUrl;

  const memberLookup = await supabase
    .from("loyalty_members")
    .select("id,email")
    .eq("member_number", memberId)
    .limit(1)
    .maybeSingle();
  if (memberLookup.error) throw memberLookup.error;

  const authRes = await supabase.auth.getUser();
  const authenticatedUserId = authRes.data.user?.id ?? null;

  const { error } = await supabase.from("notification_outbox").insert({
    channel: "email",
    subject: "Your Loyalty Statement",
    message: `Your statement is ready. Download it here: ${statementUrl}`,
    user_id: authenticatedUserId,
  });
  if (error) throw error;

  return { statementUrl, member: memberLookup.data };
}
