import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchActiveEarningRules, fetchTierRules, saveEarningRules, saveTierRules, type EarningRule } from "../../lib/loyalty-supabase";
import type { TierRule } from "../../lib/loyalty-engine";
import { toast } from "sonner";

const FALLBACK_RULES: TierRule[] = [
  { tier_label: "Bronze", min_points: 0 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Gold", min_points: 750 },
];

const FALLBACK_EARNING_RULES: EarningRule[] = [
  { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
  { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
  { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
];

export default function AdminSettingsPage() {
  const [rules, setRules] = useState<TierRule[]>(FALLBACK_RULES);
  const [earningRules, setEarningRules] = useState<EarningRule[]>(FALLBACK_EARNING_RULES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTierRules()
      .then((data) => setRules(data))
      .catch(() => setRules(FALLBACK_RULES));

    fetchActiveEarningRules()
      .then((data) => setEarningRules(data))
      .catch(() => setEarningRules(FALLBACK_EARNING_RULES));
  }, []);

  const updateRule = (tierLabel: string, nextValue: number) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.tier_label.toLowerCase() === tierLabel.toLowerCase()
          ? { ...rule, min_points: Math.max(0, Math.floor(nextValue || 0)) }
          : rule
      )
    );
  };

  const updateEarningRule = (tierLabel: string, patch: Partial<EarningRule>) => {
    setEarningRules((prev) =>
      prev.map((rule) =>
        rule.tier_label.toLowerCase() === tierLabel.toLowerCase()
          ? { ...rule, ...patch }
          : rule
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await Promise.all([saveTierRules(rules), saveEarningRules(earningRules)]);
      toast.success("Tier and earning rules saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  };

  const byTier = (label: string) => rules.find((rule) => rule.tier_label.toLowerCase() === label.toLowerCase());
  const earningByTier = (label: string) => earningRules.find((rule) => rule.tier_label.toLowerCase() === label.toLowerCase());

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Administrative configuration</p>
      </div>

      <div className="rounded-xl border border-[#9ed8ff] bg-white p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Tier Rules Configuration</h2>
          <p className="text-gray-600 text-sm mt-1">Configure points thresholds used to calculate member tier.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
            <label key={tier} className="rounded-lg border border-gray-200 p-4 block">
              <p className="text-sm font-semibold text-gray-700 mb-2">{tier} minimum points</p>
              <input
                type="number"
                min={0}
                value={byTier(tier)?.min_points ?? 0}
                onChange={(e) => updateRule(tier, Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00A3AD]/30"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#9ed8ff] bg-white p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Earning Rate Configuration</h2>
          <p className="text-gray-600 text-sm mt-1">Default target is 1 point per ₱10 with optional tier multipliers.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
            <div key={tier} className="rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">{tier} earning rule</p>
              <label className="block">
                <span className="text-xs text-gray-600">Peso per 1 point</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={earningByTier(tier)?.peso_per_point ?? 10}
                  onChange={(e) => updateEarningRule(tier, { peso_per_point: Number(e.target.value) || 10 })}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Multiplier</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={earningByTier(tier)?.multiplier ?? 1}
                  onChange={(e) => updateEarningRule(tier, { multiplier: Number(e.target.value) || 1 })}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#00A3AD] hover:bg-[#08939c] text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Rules"}
        </button>
      </div>
    </div>
  );
}
