import { Card } from "./ui/card";

type TierHistoryItem = {
  id: string;
  old_tier: string;
  new_tier: string;
  changed_at: string;
  reason?: string;
};

export default function TierHistory({ timeline }: { timeline: TierHistoryItem[] }) {
  return (
    <Card className="p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Tier Upgrade History</h3>
      {timeline.length === 0 ? (
        <p className="text-sm text-gray-500">No tier changes have been recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {timeline.map((item) => (
            <li key={item.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">
                  {item.old_tier} → {item.new_tier}
                </p>
                <span className="text-xs text-gray-500">{new Date(item.changed_at).toLocaleString()}</span>
              </div>
              {item.reason ? <p className="text-xs text-gray-600 mt-1">{item.reason}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
