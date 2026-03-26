# Sprint 1 Acceptance TypeScript Snippets

These backend-oriented snippets complement `supabase/sprint1_acceptance_upgrade.sql`.

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function calculatePointsEarned(amount: number, tier: string): Promise<number> {
  const normalizedTier = (tier || "Bronze").charAt(0).toUpperCase() + (tier || "Bronze").slice(1).toLowerCase();
  const pesoAmount = Math.max(0, Number(amount) || 0);

  const { data, error } = await supabaseAdmin
    .from("earning_rules")
    .select("peso_per_point,multiplier")
    .eq("tier_label", normalizedTier)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const pesoPerPoint = Math.max(Number(data?.peso_per_point ?? 10), 0.01);
  const multiplier = Math.max(Number(data?.multiplier ?? 1), 0.01);

  const basePoints = Math.floor(pesoAmount / pesoPerPoint);
  return Math.max(0, Math.floor(basePoints * multiplier));
}
```

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type StatementRow = {
  transaction_type: string;
  points: number;
  transaction_date: string;
  reason: string | null;
  expiry_date: string | null;
};

export async function generateStatementData(memberId: string, startDate: Date, endDate: Date) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    throw new Error("Invalid startDate");
  }
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid endDate");
  }
  if (endDate < startDate) {
    throw new Error("endDate must be greater than or equal to startDate");
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from("loyalty_members")
    .select("id, member_number, email")
    .eq("member_number", memberId)
    .limit(1)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) throw new Error("Member not found");

  const { data: allTx, error: txError } = await supabaseAdmin
    .from("loyalty_transactions")
    .select("transaction_type, points, transaction_date, reason, expiry_date")
    .eq("member_id", member.id)
    .order("transaction_date", { ascending: true });

  if (txError) throw txError;

  const transactions = (allTx || []) as StatementRow[];
  const openingBalance = transactions
    .filter((tx) => new Date(tx.transaction_date) < startDate)
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

  const rows = transactions.filter((tx) => {
    const d = new Date(tx.transaction_date);
    return d >= startDate && d <= endDate;
  });

  const periodDelta = rows.reduce((sum, tx) => sum + Number(tx.points || 0), 0);
  const closingBalance = openingBalance + periodDelta;

  return {
    memberNumber: member.member_number,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    openingBalance,
    closingBalance,
    rows,
  };
}

export async function emailStatementToMember(memberId: string, statementUrl: string) {
  const { data: member, error: memberError } = await supabaseAdmin
    .from("loyalty_members")
    .select("email, first_name")
    .eq("member_number", memberId)
    .limit(1)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member?.email) throw new Error("Member email not found");

  const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.listUsers();
  if (authUserError) throw authUserError;

  const user = authUser.users.find((u) => (u.email || "").toLowerCase() === member.email.toLowerCase());
  if (!user) throw new Error("Auth user not found for member email");

  const { error: notifyError } = await supabaseAdmin.from("notification_outbox").insert({
    user_id: user.id,
    channel: "email",
    subject: "Your Loyalty Statement",
    message: `Hi ${member.first_name || "Member"}, your statement is ready: ${statementUrl}`,
  });

  if (notifyError) throw notifyError;
}
```

```ts
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function calculateMonetaryLiability(redemptionValue = 0.01) {
  const safeRedemptionValue = Number.isFinite(redemptionValue) && redemptionValue > 0 ? redemptionValue : 0.01;

  const { data: members, error } = await supabaseAdmin
    .from("loyalty_members")
    .select("tier, points_balance");

  if (error) throw error;

  const tierBreakdown = (members || []).reduce(
    (acc, row) => {
      const tier = String(row.tier || "Bronze");
      const points = Number(row.points_balance || 0);

      if (!acc[tier]) acc[tier] = { points: 0, memberCount: 0, monetaryLiability: 0 };
      acc[tier].points += points;
      acc[tier].memberCount += 1;
      acc[tier].monetaryLiability = Number((acc[tier].points * safeRedemptionValue).toFixed(2));
      return acc;
    },
    {} as Record<string, { points: number; memberCount: number; monetaryLiability: number }>
  );

  const totalUnredeemedPoints = Object.values(tierBreakdown).reduce((s, t) => s + t.points, 0);
  const totalMonetaryLiability = Number((totalUnredeemedPoints * safeRedemptionValue).toFixed(2));

  return {
    redemptionValuePerPoint: safeRedemptionValue,
    totalUnredeemedPoints,
    totalMonetaryLiability,
    tierBreakdown,
  };
}

export async function exportLiabilityReportToExcel(redemptionValue = 0.01): Promise<Buffer> {
  const report = await calculateMonetaryLiability(redemptionValue);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Liability Report");

  sheet.addRow(["Tier", "Members", "Unredeemed Points", "Monetary Liability (PHP)"]);

  Object.entries(report.tierBreakdown).forEach(([tier, row]) => {
    sheet.addRow([tier, row.memberCount, row.points, row.monetaryLiability]);
  });

  sheet.addRow([]);
  sheet.addRow(["TOTAL", "", report.totalUnredeemedPoints, report.totalMonetaryLiability]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
```
