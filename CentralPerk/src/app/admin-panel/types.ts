export interface Member {
  member_id: string;
  id?: string | number;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string;
  enrollment_date: string;
  points_balance?: number;
  tier?: string;
}

export interface LoyaltyTransaction {
  transaction_id: string;
  member_id: string;
  points: number;
  transaction_type: string;
  transaction_date: string;
  loyalty_members?: {
    first_name: string;
    last_name: string;
    member_number: string;
  };
}

export interface TierDistribution {
  gold: number;
  silver: number;
  bronze: number;
}

export interface MemberGrowthPoint {
  key: string;
  label: string;
  count: number;
}

export interface AdminMetrics {
  totalMembers: number;
  pointsLiability: number;
  totalPointsRedeemed: number;
  tierDistribution: TierDistribution;
  newMembersThisMonth: number;
  newMembersLastMonth: number;
  growthRate: number;
  growthSeries: MemberGrowthPoint[];
  redemptionValuePerPoint: number;
  monetaryLiability: number;
  liabilityTrend: { month: string; points: number; monetary: number }[];
}
