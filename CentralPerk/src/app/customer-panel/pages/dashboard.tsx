import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Clock, TrendingUp, Gift, Award, Shield, Medal, Trophy, CheckCircle2 } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import type { AppOutletContext } from "../../types/app-context";

const tierLevels = [
  { name: "Bronze", min: 0, icon: Shield },
  { name: "Silver", min: 250, icon: Medal },
  { name: "Gold", min: 750, icon: Trophy },
] as const;

export default function Dashboard() {
  const { user } = useOutletContext<AppOutletContext>();
  const now = new Date();
  const [selectedTier, setSelectedTier] = useState<(typeof tierLevels)[number]["name"]>(
    (user.points >= 750 ? "Gold" : user.points >= 250 ? "Silver" : "Bronze") as (typeof tierLevels)[number]["name"]
  );

  const projectedBalance = user.points + user.pendingPoints;
  const derivedTierName = (user.points >= 750 ? "Gold" : user.points >= 250 ? "Silver" : "Bronze") as (typeof tierLevels)[number]["name"];
  const currentTierIndexRaw = tierLevels.findIndex((tier) => tier.name === derivedTierName);
  const currentTierIndex = Math.max(0, currentTierIndexRaw);
  const currentTierData = tierLevels[currentTierIndex];
  const nextTierData = tierLevels[currentTierIndex + 1] ?? null;
  const progressBase = currentTierData.min;
  const progressTarget = nextTierData ? nextTierData.min : Math.max(currentTierData.min, user.points);
  const tierProgress =
    nextTierData && progressTarget > progressBase
      ? Math.min(100, ((user.points - progressBase) / (progressTarget - progressBase)) * 100)
      : 100;
  const selectedTierInfo = useMemo(
    () => tierLevels.find((tier) => tier.name === selectedTier) ?? tierLevels[0],
    [selectedTier]
  );
  const hasWelcomePackage = user.transactions.some((tx) => tx.description.toLowerCase().includes("welcome package bonus"));
  const lifetimeRedeemed = user.transactions.filter((tx) => tx.type === "redeemed").reduce((sum, tx) => sum + Math.abs(tx.points), 0);
  const recentFive = [...user.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  const loyaltyCapabilities = [
    "Earn points automatically when I make a purchase",
    "See points earned displayed on receipt / POS",
    "Earn points for app downloads / completing profile / survey completion",
    "Projected point balance based on pending transactions",
    "Lifetime points earned",
    "Use points as partial payment / apply points automatically at checkout",
    "Reserve rewards before redeeming",
    "Gift points to another member",
    "Redeem points online for delivery",
    "Cancel redemption and restore points",
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user.fullName.split(" ")[0]}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-[#1A2B47] text-white border-0">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-white/90 text-sm font-medium">Current Balance</p>
              <h2 className="text-3xl font-bold mt-2 text-white">{user.points.toLocaleString()}</h2>
              <p className="text-white/90 text-sm mt-1">points</p>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/90 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>+{user.earnedThisMonth} this month</span>
          </div>
        </Card>

        <Card className="p-6 border-[#7dcfff]/50 bg-[#f0f7ff]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-sm font-medium">Pending Points</p>
              <h2 className="text-3xl font-bold text-gray-900 mt-2">{user.pendingPoints}</h2>
              <p className="text-gray-500 text-sm mt-1">processing</p>
            </div>
            <div className="w-10 h-10 bg-[#dbeafe] rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#2563eb]" />
            </div>
          </div>
          <p className="text-[#0b6cb8] text-sm">Projected: {projectedBalance.toLocaleString()} pts</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-sm font-medium">Earned This Month</p>
              <h2 className="text-3xl font-bold text-gray-900 mt-2">{user.earnedThisMonth}</h2>
              <p className="text-gray-500 text-sm mt-1">points</p>
            </div>
            <div className="w-10 h-10 bg-[#dcfce7] rounded-lg flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-[#16a34a]" />
            </div>
          </div>
          <p className="text-gray-600 text-sm">
            {
              user.transactions.filter(
                (t) =>
                  t.type === "earned" &&
                  new Date(t.date).getMonth() === now.getMonth() &&
                  new Date(t.date).getFullYear() === now.getFullYear()
              ).length
            } transactions
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-600 text-sm font-medium">Redeemed This Month</p>
              <h2 className="text-3xl font-bold text-gray-900 mt-2">{user.redeemedThisMonth}</h2>
              <p className="text-gray-500 text-sm mt-1">points</p>
            </div>
            <div className="w-10 h-10 bg-[#ffedd5] rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-[#f97316]" />
            </div>
          </div>
          <p className="text-gray-600 text-sm">
            {
              user.transactions.filter(
                (t) =>
                  t.type === "redeemed" &&
                  new Date(t.date).getMonth() === now.getMonth() &&
                  new Date(t.date).getFullYear() === now.getFullYear()
              ).length
            } redemptions
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Lifetime Points</h3>
              <p className="text-gray-500 text-sm mt-1">Total points earned since joining</p>
            </div>
            <div className="w-12 h-12 bg-[#f3e8ff] rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-[#9333ea]" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-4xl font-bold text-gray-900">{user.lifetimePoints.toLocaleString()}</h2>
            <p className="text-gray-500">points</p>
          </div>
          <p className="text-sm text-gray-600 mt-3">Member since {user.memberSince}</p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-gray-600 font-medium">Lifetime Redeemed</p>
          <h2 className="text-3xl font-bold text-gray-900 mt-2">{lifetimeRedeemed.toLocaleString()}</h2>
          <p className="text-gray-500 text-sm mt-1">points redeemed</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Tier Progress</h3>
              <p className="text-gray-500 text-sm mt-1">{nextTierData ? `Progress to ${nextTierData.name}` : "Maximum tier achieved!"}</p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#1A2B47] text-white">
              <currentTierData.icon className="w-4 h-4" />
              {derivedTierName}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            {tierLevels.map((tier) => {
              const TierIcon = tier.icon;
              const isCurrent = tier.name === derivedTierName;
              const isReached = user.points >= tier.min;
              const isSelected = selectedTier === tier.name;
              return (
                <button
                  key={tier.name}
                  type="button"
                  onClick={() => setSelectedTier(tier.name)}
                  className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 text-left ${
                    isSelected
                      ? "border-[#00A3AD] bg-[#e6f8fa] text-[#1A2B47] font-semibold"
                      : isCurrent
                      ? "border-[#1A2B47]/40 bg-[#f5f7fb] text-[#1A2B47]"
                      : isReached
                      ? "border-gray-200 bg-white text-gray-700"
                      : "border-gray-100 bg-gray-50 text-gray-400"
                  }`}
                >
                  <TierIcon className="w-4 h-4" />
                  <span>{tier.name}</span>
                </button>
              );
            })}
          </div>

          <p className="text-sm text-gray-600 mb-3">
            <strong>{selectedTierInfo.name}</strong> starts at {selectedTierInfo.min.toLocaleString()} points.
          </p>

          <div className="space-y-2">
            <Progress value={tierProgress} className="h-3" />
            <div className="flex items-center justify-between text-sm gap-2">
              <span className="text-gray-600">
                {user.points.toLocaleString()} / {progressTarget.toLocaleString()} points
              </span>
              {nextTierData ? (
                <span className="text-[#1A2B47] font-medium text-right">
                  {Math.max(nextTierData.min - user.points, 0).toLocaleString()} to {nextTierData.name}
                </span>
              ) : <span className="text-[#1A2B47] font-medium text-right">Max tier achieved</span>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Recent Transactions (Last 5)</h3>
        <div className="space-y-2">
          {recentFive.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                <p className="text-xs text-gray-500">{new Date(tx.date).toLocaleDateString()}</p>
              </div>
              <p className={`text-sm font-semibold ${tx.type === "redeemed" ? "text-orange-600" : "text-green-600"}`}>
                {tx.type === "redeemed" ? "-" : "+"}{tx.points}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {hasWelcomePackage && (
        <Card className="p-4 border-[#9ed8ff] bg-[#eef8ff]">
          <p className="text-sm text-[#1A2B47] font-medium">
            Welcome to Central Perk Rewards! Your welcome package points were applied to your account.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="earn">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-[#9ed8ff] bg-gradient-to-br from-[#f0f7ff] to-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center">
                <Gift className="w-6 h-6 text-[#1A2B47]" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Earn More Points</h4>
                <p className="text-sm text-gray-500 mt-1">Complete tasks and earn rewards</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="rewards">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-[#f7c58b] bg-gradient-to-br from-[#fff7ed] to-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#ffedd5] rounded-xl flex items-center justify-center">
                <Award className="w-6 h-6 text-[#f97316]" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Redeem Rewards</h4>
                <p className="text-sm text-gray-500 mt-1">Browse available rewards</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="activity">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-[#a8ccff] bg-gradient-to-br from-[#eef5ff] to-white">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[#2563eb]" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">View Activity</h4>
                <p className="text-sm text-gray-500 mt-1">Track your transactions</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Loyalty Program Capabilities</h3>
            <p className="text-sm text-gray-600 mt-1">End-to-end earning and redemption experience aligned to your requested flow</p>
          </div>
          <Badge variant="outline" className="text-[#23385a] border-[#1A2B47]/30">
            {loyaltyCapabilities.length} features
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {loyaltyCapabilities.map((feature) => (
            <div key={feature} className="rounded-xl border border-gray-200 p-3 bg-white flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#1A2B47] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-700">{feature}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}



