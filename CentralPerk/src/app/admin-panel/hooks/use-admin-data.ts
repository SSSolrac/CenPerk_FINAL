import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../utils/supabase/client";
import type { AdminMetrics, LoyaltyTransaction, Member, MemberGrowthPoint, TierDistribution } from "../types";
import { fetchTierRules, processAllMemberExpiredPoints } from "../../lib/loyalty-supabase";
import { resolveTier, type TierRule } from "../../lib/loyalty-engine";

export function useAdminData() {
  const [members, setMembers] = useState<Member[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyTransaction[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [tierRules, setTierRules] = useState<TierRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Do not block admin pages if expiry processing fails.
      try {
        await processAllMemberExpiredPoints();
      } catch (expiryErr) {
        console.warn("Expiry processing failed in admin fetch:", expiryErr);
      }

      const { data: membersData, error: membersError } = await supabase
        .from("loyalty_members")
        .select("*")
        .order("enrollment_date", { ascending: false });

      if (membersError) throw membersError;

      const { data: redemptionsData, error: redemptionsError } = await supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("transaction_type", "REDEEM");

      const { data: transactionsData, error: transactionsError } = await supabase
        .from("loyalty_transactions")
        .select("*, loyalty_members(first_name, last_name, member_number)")
        .order("transaction_date", { ascending: false });

      const rules = await fetchTierRules();

      setMembers((membersData || []) as Member[]);
      setRedemptions(redemptionsError ? [] : ((redemptionsData || []) as LoyaltyTransaction[]));
      setTransactions(transactionsError ? [] : ((transactionsData || []) as LoyaltyTransaction[]));
      setTierRules(rules);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message ?? "Failed to load admin data.")
          : "Failed to load admin data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getJoinedDate = (member: Member) => {
    const raw = member.enrollment_date || (member as any).created_at;
    const parsed = raw ? new Date(raw) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  };

  const buildGrowthSeries = (): MemberGrowthPoint[] => {
    const now = new Date();
    const points: MemberGrowthPoint[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      points.push({
        key,
        label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
        count: 0,
      });
    }

    for (const member of members) {
      const joined = getJoinedDate(member);
      if (!joined) continue;
      const key = `${joined.getFullYear()}-${joined.getMonth()}`;
      const match = points.find((p) => p.key === key);
      if (match) match.count += 1;
    }

    return points;
  };

  const metrics = useMemo(() => {
    const totalMembers = members.length;
    const pointsLiability = members.reduce((sum, member) => sum + (member.points_balance || 0), 0);
    const totalPointsRedeemed = redemptions.reduce((sum, tx) => sum + Math.abs(tx.points || 0), 0);
    const tierDistribution: TierDistribution = members.reduce(
      (acc, member) => {
        const balance = member.points_balance || 0;
        const tier = resolveTier(balance, tierRules).toLowerCase();
        if (tier === "gold") acc.gold += 1;
        else if (tier === "silver") acc.silver += 1;
        else acc.bronze += 1;
        return acc;
      },
      { gold: 0, silver: 0, bronze: 0 }
    );

    const growthSeries = buildGrowthSeries();
    const newMembersThisMonth = growthSeries[growthSeries.length - 1]?.count ?? 0;
    const newMembersLastMonth = growthSeries[growthSeries.length - 2]?.count ?? 0;
    const growthRate =
      newMembersLastMonth > 0
        ? ((newMembersThisMonth - newMembersLastMonth) / newMembersLastMonth) * 100
        : newMembersThisMonth > 0
        ? 100
        : 0;

    const redemptionValuePerPoint = 0.01;
    const monetaryLiability = Number((pointsLiability * redemptionValuePerPoint).toFixed(2));
    const liabilityTrend = growthSeries.map((point) => {
      const monthMembers = members.filter((member) => {
        const joined = getJoinedDate(member);
        if (!joined) return false;
        return `${joined.getFullYear()}-${joined.getMonth()}` <= point.key;
      });
      const monthPoints = monthMembers.reduce((sum, m) => sum + Number(m.points_balance || 0), 0);
      return {
        month: point.label,
        points: monthPoints,
        monetary: Number((monthPoints * redemptionValuePerPoint).toFixed(2)),
      };
    });

    return {
      totalMembers,
      pointsLiability,
      totalPointsRedeemed,
      tierDistribution,
      newMembersThisMonth,
      newMembersLastMonth,
      growthRate,
      growthSeries,
      redemptionValuePerPoint,
      monetaryLiability,
      liabilityTrend,
    } satisfies AdminMetrics;
  }, [members, redemptions, tierRules]);

  return { members, transactions, loading, error, metrics, tierRules, refetch: fetchData };
}
