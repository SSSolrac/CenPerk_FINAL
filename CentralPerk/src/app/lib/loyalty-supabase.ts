import { supabase } from "../../utils/supabase/client";
import type { EarnOpportunity, MemberData, Reward, Transaction } from "../types/loyalty";
import {
  DEFAULT_TIER_RULES,
  monthKey,
  normalizeTierLabel,
  normalizeTierRules,
  resolveTier,
  type SupportedTier,
  type TierRule,
} from "./loyalty-engine";

type AnyRecord = Record<string, any>;

function getMemberPk(member: AnyRecord): { key: string; value: any } | null {
  if (member?.id !== undefined) return { key: "id", value: member.id };
  if (member?.member_id !== undefined) return { key: "member_id", value: member.member_id };
  return null;
}

function toTitleCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function mapTxType(rawType: string): Transaction["type"] {
  const value = (rawType || "").toUpperCase();
  if (value === "PURCHASE" || value === "MANUAL_AWARD" || value === "EARN") return "earned";
  if (value === "REDEEM" || value === "REDEEMED" || value === "REWARD_REDEEMED") return "redeemed";
  if (value === "GIFT" || value === "TRANSFER") return "gifted";
  if (value === "EXPIRY_DEDUCTION" || value === "EXPIRED") return "expired";
  if (value === "PENDING") return "pending";
  return "earned";
}

function getTxDateValue(tx: AnyRecord): string {
  return String(tx.transaction_date ?? tx.created_at ?? new Date().toISOString());
}

function getTierCap(rules: TierRule[]): number {
  return Math.max(0, ...rules.map((r) => Number(r.min_points) || 0));
}

const WELCOME_PACKAGE_REASON = "Welcome Package Bonus";
const WELCOME_PACKAGE_POINTS = 100;

type EarningRule = {
  tier_label: SupportedTier;
  peso_per_point: number;
  multiplier: number;
  is_active: boolean;
};

async function grantWelcomePackageForMember(member: AnyRecord, memberPk: { key: string; value: any }) {
  const existingWelcomeRes = await supabase
    .from("loyalty_transactions")
    .select("transaction_id,id")
    .eq("member_id", memberPk.value)
    .eq("reason", WELCOME_PACKAGE_REASON)
    .limit(1)
    .maybeSingle();
  if (existingWelcomeRes.error) throw existingWelcomeRes.error;
  if (existingWelcomeRes.data) return { granted: false, pointsAdded: 0 };

  const rules = await fetchTierRules();
  const tierCap = getTierCap(rules);
  const currentBalance = Math.min(tierCap, Number(member.points_balance ?? 0));
  const newBalance = Math.min(tierCap, currentBalance + WELCOME_PACKAGE_POINTS);
  const newTier = resolveTier(newBalance, rules);

  const insertRes = await supabase.from("loyalty_transactions").insert({
    member_id: memberPk.value,
    transaction_type: "EARN",
    points: WELCOME_PACKAGE_POINTS,
    reason: WELCOME_PACKAGE_REASON,
  });
  if (insertRes.error) throw insertRes.error;

  const updateRes = await supabase
    .from("loyalty_members")
    .update({ points_balance: newBalance, tier: newTier })
    .eq(memberPk.key, memberPk.value);
  if (updateRes.error) throw updateRes.error;

  return { granted: true, pointsAdded: WELCOME_PACKAGE_POINTS, newBalance, newTier };
}

async function processMemberExpiredPoints(memberPk: { key: string; value: any }) {
  const txQuery = await supabase
    .from("loyalty_transactions")
    .select("points,transaction_type,expiry_date")
    .eq("member_id", memberPk.value)
    .limit(500);

  if (txQuery.error) throw txQuery.error;
  const rows = (txQuery.data || []) as AnyRecord[];
  if (rows.length === 0) return;

  const now = Date.now();
  const expiredEarned = rows
    .filter((row) => Number(row.points || 0) > 0 && row.expiry_date && new Date(row.expiry_date).getTime() < now)
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);
  const alreadyDeducted = rows
    .filter((row) => String(row.transaction_type || "").toUpperCase() === "EXPIRY_DEDUCTION")
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);
  const totalExpired = Math.max(0, expiredEarned - alreadyDeducted);
  if (totalExpired === 0) return;

  const { data: memberNow, error: memberErr } = await supabase
    .from("loyalty_members")
    .select("points_balance")
    .eq(memberPk.key, memberPk.value)
    .limit(1)
    .maybeSingle();
  if (memberErr) throw memberErr;

  const rules = await fetchTierRules();
  const tierCap = getTierCap(rules);
  const currentBalance = Math.min(tierCap, Number(memberNow?.points_balance ?? 0));
  const newBalance = Math.min(tierCap, Math.max(0, currentBalance - totalExpired));
  const newTier = resolveTier(newBalance, rules);

  const insertRes = await supabase.from("loyalty_transactions").insert({
    member_id: memberPk.value,
    transaction_type: "EXPIRY_DEDUCTION",
    points: -Math.abs(totalExpired),
    reason: "Points Expired",
  });
  if (insertRes.error) throw insertRes.error;

  const updateRes = await supabase
    .from("loyalty_members")
    .update({ points_balance: newBalance, tier: newTier })
    .eq(memberPk.key, memberPk.value);
  if (updateRes.error) throw updateRes.error;
}

export async function processAllMemberExpiredPoints() {
  const { data, error } = await supabase.from("loyalty_members").select("id,member_id");
  if (error) throw error;
  const members = (data || []) as AnyRecord[];

  for (const member of members) {
    const pk = getMemberPk(member);
    if (!pk) continue;
    await processMemberExpiredPoints(pk);
  }
}

export async function fetchTierRules(): Promise<TierRule[]> {
  const { data, error } = await supabase
    .from("points_rules")
    .select("tier_label,min_points,is_active")
    .eq("is_active", true)
    .order("min_points", { ascending: false });

  if (error || !data || data.length === 0) return DEFAULT_TIER_RULES;
  return normalizeTierRules(data as TierRule[]);
}

export async function saveTierRules(rules: TierRule[]): Promise<void> {
  const normalized = normalizeTierRules(rules);
  const updates = normalized.map((rule) => ({
    tier_label: normalizeTierLabel(rule.tier_label),
    min_points: Math.max(0, Math.floor(Number(rule.min_points) || 0)),
    is_active: true,
  }));

  const { error } = await supabase.from("points_rules").upsert(updates, { onConflict: "tier_label" });
  if (error) throw error;
}

async function fetchEarningRuleForTier(tier: SupportedTier): Promise<EarningRule> {
  const { data, error } = await supabase
    .from("earning_rules")
    .select("tier_label,peso_per_point,multiplier,is_active")
    .eq("tier_label", tier)
    .eq("is_active", true)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { tier_label: tier, peso_per_point: 10, multiplier: 1, is_active: true };
  }

  return {
    tier_label: normalizeTierLabel(String(data.tier_label)) as SupportedTier,
    peso_per_point: Number(data.peso_per_point || 10),
    multiplier: Number(data.multiplier || 1),
    is_active: Boolean(data.is_active ?? true),
  };
}

export async function calculateDynamicPurchasePoints(input: {
  amountSpent: number;
  tier: SupportedTier;
}): Promise<number> {
  const amount = Math.max(0, Number(input.amountSpent) || 0);
  const rule = await fetchEarningRuleForTier(input.tier);
  const basePoints = Math.floor(amount / Math.max(rule.peso_per_point, 0.01));
  return Math.max(0, Math.floor(basePoints * Math.max(rule.multiplier, 0.01)));
}

export async function loadRewardsCatalog(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards_catalog")
    .select("*")
    .eq("is_active", true)
    .order("points_cost", { ascending: true });

  if (error || !data) return [];

  return (data as AnyRecord[]).map((row) => ({
    id: String(row.reward_id ?? row.id ?? ""),
    name: String(row.name ?? "Reward"),
    description: String(row.description ?? ""),
    pointsCost: Number(row.points_cost ?? 0),
    category: String(row.category ?? "voucher") as Reward["category"],
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    available: Boolean(row.is_active ?? true),
    expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
  }));
}

export async function loadEarnTasks(): Promise<EarnOpportunity[]> {
  const { data, error } = await supabase
    .from("earn_tasks")
    .select("*")
    .eq("is_active", true)
    .order("points", { ascending: false });

  if (error || !data) return [];

  return (data as AnyRecord[]).map((row) => ({
    id: String(row.task_code ?? row.id ?? ""),
    title: String(row.title ?? "Task"),
    description: String(row.description ?? ""),
    points: Number(row.points ?? 0),
    icon: String(row.icon_key ?? "user"),
    completed: Boolean(row.default_completed ?? false),
    active: Boolean(row.is_active ?? true),
  }));
}

export async function ensureWelcomePackage(memberIdentifier: string, fallbackEmail?: string) {
  const member = await findMember(memberIdentifier, fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const memberPk = getMemberPk(member);
  if (!memberPk) throw new Error("Member primary key is missing.");
  return grantWelcomePackageForMember(member, memberPk);
}

export async function findMember(memberIdentifier?: string, fallbackEmail?: string) {
  let lookup: { data: AnyRecord | null; error: any } = { data: null, error: null };

  if (memberIdentifier) {
    lookup = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("member_number", memberIdentifier)
      .limit(1)
      .maybeSingle();
  }

  if (!lookup.data && fallbackEmail) {
    lookup = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("email", fallbackEmail)
      .limit(1)
      .maybeSingle();
  }

  if (!lookup.data) {
    const authRes = await supabase.auth.getUser();
    const authEmail = authRes.data.user?.email;
    if (authEmail && authEmail !== fallbackEmail) {
      lookup = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("email", authEmail)
        .limit(1)
        .maybeSingle();
    }
  }

  if (lookup.error) throw lookup.error;
  return lookup.data as AnyRecord | null;
}

export async function loadMemberSnapshot(currentUser: MemberData): Promise<Partial<MemberData> | null> {
  const member = await findMember(currentUser.memberId, currentUser.email);
  if (!member) return null;

  const rules = await fetchTierRules();
  const pk = getMemberPk(member);
  if (!pk) return null;

  await grantWelcomePackageForMember(member, pk);
  await processMemberExpiredPoints(pk);

  const refreshedMemberRes = await supabase
    .from("loyalty_members")
    .select("*")
    .eq(pk.key, pk.value)
    .limit(1)
    .maybeSingle();
  const refreshedMember = (refreshedMemberRes.data as AnyRecord | null) ?? member;
  const tierCap = getTierCap(rules);
  const currentBalance = Math.min(tierCap, Number(refreshedMember.points_balance ?? currentUser.points ?? 0));

  const txRes = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("member_id", pk.value)
    .order("transaction_date", { ascending: false })
    .limit(200);

  const rawTx = (txRes.data || []) as AnyRecord[];

  let runningBalance = currentBalance;
  const transactions: Transaction[] = rawTx.map((tx, index) => {
    const signedPoints = Number(tx.points ?? 0);
    const mappedType = mapTxType(String(tx.transaction_type ?? ""));
    const mapped: Transaction = {
      id: String(tx.transaction_id ?? tx.id ?? `${index}`),
      date: getTxDateValue(tx),
      description: String(tx.reason ?? tx.description ?? tx.transaction_type ?? "Transaction"),
      type: mappedType,
      points: Math.abs(signedPoints),
      balance: runningBalance,
      category: tx.reason ? "System" : "Purchase",
      receiptId: tx.receipt_id ? String(tx.receipt_id) : undefined,
    };
    if (mappedType !== "pending") {
      runningBalance -= signedPoints;
    }
    return mapped;
  });

  const nowMonth = monthKey(new Date());
  const isCurrentMonthTx = (tx: AnyRecord) => monthKey(getTxDateValue(tx)) === nowMonth;
  const pendingPoints = rawTx
    .filter((tx) => mapTxType(String(tx.transaction_type ?? "")) === "pending" && Number(tx.points || 0) > 0)
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

  const earnedThisMonth = rawTx
    .filter(
      (tx) =>
        mapTxType(String(tx.transaction_type ?? "")) === "earned" &&
        Number(tx.points || 0) > 0 &&
        isCurrentMonthTx(tx)
    )
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

  const redeemedThisMonth = rawTx
    .filter(
      (tx) =>
        mapTxType(String(tx.transaction_type ?? "")) === "redeemed" &&
        Number(tx.points || 0) !== 0 &&
        isCurrentMonthTx(tx)
    )
    .reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);

  const rawLifetimePoints = rawTx
    .filter(
      (tx) => mapTxType(String(tx.transaction_type ?? "")) === "earned" && Number(tx.points || 0) > 0
    )
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);
  const lifetimePoints = Math.min(rawLifetimePoints, tierCap);

  const upcomingExpiring = rawTx.filter((tx) => {
    if (!tx.expiry_date) return false;
    const expiryDate = new Date(tx.expiry_date);
    const ms = expiryDate.getTime() - Date.now();
    const days = ms / (1000 * 60 * 60 * 24);
    return Number(tx.points || 0) > 0 && days >= 0 && days <= 30;
  });

  const expiringPoints = upcomingExpiring.reduce((sum, tx) => sum + Number(tx.points || 0), 0);
  const nearestDays = upcomingExpiring.length
    ? Math.max(
        0,
        Math.min(
          ...upcomingExpiring.map((tx) =>
            Math.ceil((new Date(tx.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          )
        )
      )
    : 0;

  const tier = normalizeTierLabel(resolveTier(currentBalance, rules)) as MemberData["tier"];

  return {
    memberId: String(refreshedMember.member_number || currentUser.memberId),
    fullName: `${refreshedMember.first_name || ""} ${refreshedMember.last_name || ""}`.trim() || currentUser.fullName,
    email: String(refreshedMember.email || currentUser.email),
    phone: String(refreshedMember.phone || currentUser.phone),
    address: String(refreshedMember.address || currentUser.address || ""),
    profileImage: String(refreshedMember.profile_photo_url || currentUser.profileImage || ""),
    memberSince: refreshedMember.enrollment_date
      ? new Date(refreshedMember.enrollment_date).toLocaleDateString()
      : currentUser.memberSince,
    points: currentBalance,
    pendingPoints,
    lifetimePoints,
    earnedThisMonth,
    redeemedThisMonth,
    expiringPoints,
    daysUntilExpiry: nearestDays,
    tier,
    transactions,
  };
}

export async function loadMemberActivity(memberIdentifier: string, fallbackEmail?: string) {
  const member = await findMember(memberIdentifier, fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");

  const rules = await fetchTierRules();
  await processMemberExpiredPoints(pk);

  const memberRes = await supabase
    .from("loyalty_members")
    .select("*")
    .eq(pk.key, pk.value)
    .limit(1)
    .maybeSingle();
  if (memberRes.error) throw memberRes.error;
  const refreshed = (memberRes.data || member) as AnyRecord;

  const txRes = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("member_id", pk.value)
    .order("transaction_date", { ascending: false })
    .limit(500);
  if (txRes.error) throw txRes.error;
  const rawTx = (txRes.data || []) as AnyRecord[];

  return {
    balance: {
      member_id: String(refreshed.member_number || memberIdentifier),
      points_balance: Number(refreshed.points_balance || 0),
      tier: resolveTier(Number(refreshed.points_balance || 0), rules),
    },
    history: rawTx.map((tx) => ({
      type: String(tx.transaction_type || ""),
      points: Number(tx.points || 0),
      date: getTxDateValue(tx),
      expiry_date: tx.expiry_date ? String(tx.expiry_date) : null,
      reason: String(tx.reason || ""),
    })),
  };
}

export async function awardMemberPoints(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  transactionType: "PURCHASE" | "MANUAL_AWARD" | "EARN";
  reason: string;
  amountSpent?: number;
}) {
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");

  const rules = await fetchTierRules();
  const tierCap = getTierCap(rules);
  const currentBalance = Math.min(tierCap, Number(member.points_balance ?? 0));
  let pointsToAdd = Math.max(0, Math.floor(input.points));
  const memberTier = normalizeTierLabel(String(member.tier || "Bronze")) as SupportedTier;
  if (input.transactionType === "PURCHASE") {
    const purchaseAmount = Number(input.amountSpent || 0);
    pointsToAdd = await calculateDynamicPurchasePoints({ amountSpent: purchaseAmount, tier: memberTier });
  }
  const newBalance = Math.min(tierCap, currentBalance + pointsToAdd);
  const newTier = resolveTier(newBalance, rules);

  const txPayload: AnyRecord = {
    member_id: pk.value,
    transaction_type: input.transactionType,
    points: pointsToAdd,
    reason: input.reason,
  };
  if (input.amountSpent !== undefined) txPayload.amount_spent = input.amountSpent;
  if (input.transactionType === "PURCHASE") {
    txPayload.expiry_date = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  const insertRes = await supabase.from("loyalty_transactions").insert(txPayload);
  if (insertRes.error) throw insertRes.error;

  const updateRes = await supabase
    .from("loyalty_members")
    .update({ points_balance: newBalance, tier: newTier })
    .eq(pk.key, pk.value);
  if (updateRes.error) throw updateRes.error;

  return { newBalance, newTier, pointsAdded: pointsToAdd };
}

export async function redeemMemberPoints(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
}) {
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");

  const rules = await fetchTierRules();
  const tierCap = getTierCap(rules);
  const currentBalance = Number(member.points_balance ?? 0);
  const boundedCurrentBalance = Math.min(tierCap, currentBalance);
  const pointsToDeduct = Math.max(0, Math.floor(input.points));
  if (pointsToDeduct > boundedCurrentBalance) throw new Error("Not enough points.");

  const newBalance = Math.min(tierCap, Math.max(0, boundedCurrentBalance - pointsToDeduct));
  const newTier = resolveTier(newBalance, rules);

  const insertRes = await supabase.from("loyalty_transactions").insert({
    member_id: pk.value,
    transaction_type: input.transactionType ?? "REDEEM",
    points: -Math.abs(pointsToDeduct),
    reason: input.reason,
  });
  if (insertRes.error) throw insertRes.error;

  const fifoConsume = await supabase.rpc("loyalty_consume_points_fifo", {
    p_member_id: pk.value,
    p_points_to_consume: pointsToDeduct,
  });
  if (fifoConsume.error) throw fifoConsume.error;

  const updateRes = await supabase
    .from("loyalty_members")
    .update({ points_balance: newBalance, tier: newTier })
    .eq(pk.key, pk.value);
  if (updateRes.error) throw updateRes.error;

  return { newBalance, newTier, pointsDeducted: pointsToDeduct };
}

export async function updateMemberProfile(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  profilePhotoUrl?: string;
}) {
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");

  const updateRes = await supabase
    .from("loyalty_members")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      address: input.address ?? null,
      profile_photo_url: input.profilePhotoUrl ?? null,
    })
    .eq(pk.key, pk.value);
  if (updateRes.error) throw updateRes.error;

  return { success: true };
}

export async function uploadMemberProfilePhoto(memberIdentifier: string, file: File): Promise<string> {
  const member = await findMember(memberIdentifier);
  if (!member) throw new Error("Member not found in loyalty_members.");

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${member.member_number || memberIdentifier}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Unable to resolve profile photo URL.");
  return data.publicUrl;
}

export async function loadTierHistory(memberIdentifier: string, fallbackEmail?: string) {
  const member = await findMember(memberIdentifier, fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const memberId = Number(member.id ?? member.member_id);

  const { data, error } = await supabase
    .from("tier_history")
    .select("id,old_tier,new_tier,changed_at,reason")
    .eq("member_id", memberId)
    .order("changed_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as AnyRecord[];
}

export async function queueExpiryReminderNotifications() {
  const { data, error } = await supabase.rpc("loyalty_queue_expiry_warning_notifications");
  if (error) throw error;
  return Number(data || 0);
}
