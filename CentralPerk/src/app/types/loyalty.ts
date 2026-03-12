export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "earned" | "redeemed" | "expired" | "pending" | "gifted";
  points: number;
  balance: number;
  category?: string;
  receiptId?: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: "food" | "beverage" | "merchandise" | "voucher";
  imageUrl?: string;
  available: boolean;
  expiryDate?: string;
  reserved?: boolean;
}

export interface EarnOpportunity {
  id: string;
  title: string;
  description: string;
  points: number;
  completed?: boolean;
  icon: string;
  active?: boolean;
}

export interface MemberData {
  memberId: string;
  fullName: string;
  email: string;
  phone: string;
  birthdate?: string;
  address?: string;
  profileImage: string;
  tier: "Bronze" | "Silver" | "Gold";
  memberSince: string;
  status: "Active" | "Inactive";
  points: number;
  pendingPoints: number;
  lifetimePoints: number;
  expiringPoints: number;
  daysUntilExpiry: number;
  earnedThisMonth: number;
  redeemedThisMonth: number;
  transactions: Transaction[];
  profileComplete: boolean;
  hasDownloadedApp: boolean;
  surveysCompleted: number;
}
