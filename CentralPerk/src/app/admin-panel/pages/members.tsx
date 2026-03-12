import { useMemo, useState } from "react";
import { useAdminData } from "../hooks/use-admin-data";
import { MemberLookup } from "../../components/member-lookup";
import { awardMemberPoints } from "../../lib/loyalty-supabase";
import { toast } from "sonner";

export default function AdminMembersPage() {
  const { members, loading, error, refetch } = useAdminData();
  const [query, setQuery] = useState("");
  const [awardingMember, setAwardingMember] = useState<string | null>(null);

  const handleManualAward = async (memberNumber: string) => {
    const pointsInput = window.prompt("Enter points to award:");
    if (!pointsInput) return;

    const points = Number(pointsInput);
    if (!Number.isFinite(points) || points <= 0) {
      toast.error("Please enter a valid positive number of points.");
      return;
    }

    const reason = window.prompt("Enter reason for manual award:", "Manual admin adjustment") || "Manual admin adjustment";

    try {
      setAwardingMember(memberNumber);
      await awardMemberPoints({
        memberIdentifier: memberNumber,
        points,
        transactionType: "MANUAL_AWARD",
        reason,
      });
      await refetch();
      toast.success(`Awarded ${points} points to ${memberNumber}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to award points.");
    } finally {
      setAwardingMember(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
      return (
        m.member_number.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        fullName.includes(q)
      );
    });
  }, [members, query]);

  if (loading) return <p className="text-base text-gray-700">Loading members...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Member Lookup</h1>
        <p className="text-gray-500 mt-1">Search and review loyalty members</p>
      </div>

      <MemberLookup onSearch={setQuery} isLoading={loading} />

      <div className="bg-white rounded-xl p-6 border border-[#9ed8ff]">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member #</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Email</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Mobile</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Points</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Joined</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.member_id || String(member.id)} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 text-sm font-medium text-gray-800">{member.member_number}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">{member.first_name} {member.last_name}</td>
                  <td className="py-4 px-4 text-sm text-gray-600">{member.email}</td>
                  <td className="py-4 px-4 text-sm text-gray-600">{member.phone}</td>
                  <td className="py-4 px-4 text-sm font-semibold text-gray-800">
                    {(member.points_balance || 0).toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {new Date(member.enrollment_date).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4">
                    <button
                      type="button"
                      onClick={() => handleManualAward(member.member_number)}
                      disabled={awardingMember === member.member_number}
                      className="rounded-md bg-[#00A3AD] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#08939c] disabled:opacity-60"
                    >
                      {awardingMember === member.member_number ? "Awarding..." : "Manual Award"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="py-6 text-gray-500">No matching members found.</p> : null}
        </div>
      </div>
    </div>
  );
}

