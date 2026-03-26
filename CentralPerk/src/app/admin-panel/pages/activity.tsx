import { useAdminData } from "../hooks/use-admin-data";
import { toast } from "sonner";

export default function AdminActivityPage() {
  const { transactions, loading, error } = useAdminData();

  const downloadStatement = () => {
    if (transactions.length === 0) return;

    const header = "Date,Member Number,Member Name,Type,Points\n";
    const rows = transactions
      .map((transaction) => {
        const memberNumber = transaction.loyalty_members?.member_number || "N/A";
        const memberName = transaction.loyalty_members
          ? `${transaction.loyalty_members.first_name} ${transaction.loyalty_members.last_name}`
          : "Unknown";
        const date = new Date(transaction.transaction_date).toLocaleDateString();
        return `${date},${memberNumber},"${memberName}",${transaction.transaction_type},${transaction.points}`;
      })
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "points_statement.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPdf = () => {
    try {
      if (transactions.length === 0) {
        toast.error("No activity available to export.");
        return;
      }

      const htmlRows = transactions
        .map((transaction) => {
          const memberNumber = transaction.loyalty_members?.member_number || "N/A";
          const memberName = transaction.loyalty_members
            ? `${transaction.loyalty_members.first_name} ${transaction.loyalty_members.last_name}`
            : "Unknown";
          const date = new Date(transaction.transaction_date).toLocaleDateString();
          return `<tr><td>${date}</td><td>${memberNumber}</td><td>${memberName}</td><td>${transaction.transaction_type}</td><td>${transaction.points}</td></tr>`;
        })
        .join("");

      const html = `
        <html>
          <head>
            <title>CentralPerk Admin Points Activity</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
              .brand { display:flex; justify-content:space-between; align-items:center; background:#1A2B47; color:#fff; padding:12px 16px; border-radius:8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
              th { background: #f3f4f6; }
            </style>
          </head>
          <body>
            <div class="brand"><strong>CentralPerk Loyalty</strong><span>Admin Activity Report</span></div>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Member #</th><th>Member Name</th><th>Type</th><th>Points</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>
          </body>
        </html>
      `;

      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) throw new Error("Popup blocked. Allow popups to print your PDF.");
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
      toast.success("PDF ready. Print dialog opened.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate PDF.");
    }
  };

  if (loading) return <p className="text-base text-gray-700">Loading activity...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recent Points Activity</h1>
          <p className="text-gray-500 mt-1">Complete transaction history</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadStatement}
            className="bg-[#00A3AD] hover:bg-[#08939c] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Download CSV
          </button>
          <button
            onClick={downloadPdf}
            className="bg-[#1A2B47] hover:bg-[#23385a] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Download PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-[#f7c58b]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Date</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member #</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Type</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Points</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.transaction_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 text-sm text-gray-700">{new Date(tx.transaction_date).toLocaleDateString()}</td>
                  <td className="py-4 px-4 text-sm font-medium text-gray-800">{tx.loyalty_members?.member_number || "N/A"}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">
                    {tx.loyalty_members
                      ? `${tx.loyalty_members.first_name} ${tx.loyalty_members.last_name}`
                      : "Unknown"}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-700"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${String(tx.transaction_type).toUpperCase().includes("REDEEM") ? "bg-[#ffedd5] text-[#c2410c]" : String(tx.transaction_type).toUpperCase().includes("EARN") || String(tx.transaction_type).toUpperCase().includes("PURCHASE") ? "bg-[#dcfce7] text-[#15803d]" : String(tx.transaction_type).toUpperCase().includes("EXPIRY") ? "bg-[#f5f0ff] text-[#7e22ce]" : "bg-[#e6f8fa] text-[#0f766e]"}`}>{tx.transaction_type}</span></td>
                  <td className="py-4 px-4 text-sm font-semibold text-gray-800">{tx.points.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 ? <p className="py-6 text-gray-500">No transactions found.</p> : null}
        </div>
      </div>
    </div>
  );
}

