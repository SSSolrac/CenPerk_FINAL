import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../utils/supabase/client';
import { getRoleFromSession } from '../auth/auth';

export type ExportTransactionRow = {
  transaction_date: string;
  transaction_type: string;
  points: number;
  amount_spent: number | null;
  reason: string | null;
  member_id?: number | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

async function getCustomerMemberId() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userEmail = authData.user?.email;
  if (!userEmail) {
    throw new Error('No logged-in user email found for customer export.');
  }

  const { data: member, error: memberError } = await supabase
    .from('loyalty_members')
    .select('id, member_id')
    .eq('email', userEmail)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) {
    throw new Error('No loyalty member profile found for this customer account.');
  }

  return {
    id: member.id as number | null,
    externalMemberId: (member.member_id as number | null) ?? null,
  };
}

export async function fetchTransactionsForExport(): Promise<ExportTransactionRow[]> {
  const role = await getRoleFromSession();

  let query = supabase
    .from('loyalty_transactions')
    .select('transaction_date, transaction_type, points, amount_spent, reason, member_id')
    .order('transaction_date', { ascending: false });

  if (role === 'customer') {
    const member = await getCustomerMemberId();

    if (member.id !== null && member.externalMemberId !== null) {
      query = query.or(`member_id.eq.${member.id},member_id.eq.${member.externalMemberId}`);
    } else if (member.id !== null) {
      query = query.eq('member_id', member.id);
    } else if (member.externalMemberId !== null) {
      query = query.eq('member_id', member.externalMemberId);
    } else {
      throw new Error('Unable to resolve member ID for customer export.');
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ExportTransactionRow[];
}

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function exportToCSV(data: ExportTransactionRow[], filename: string) {
  const headers = ['Transaction Date', 'Transaction Type', 'Points', 'Amount Spent', 'Reason'];
  const rows = data.map((row) => [
    formatDate(row.transaction_date),
    row.transaction_type,
    row.points,
    row.amount_spent ?? '',
    row.reason ?? '',
  ]);

  const csv = [headers, ...rows].map((line) => line.map(csvEscape).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF(data: ExportTransactionRow[], filename: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Transaction Report', 40, 40);

  autoTable(doc, {
    startY: 60,
    head: [['Transaction Date', 'Transaction Type', 'Points', 'Amount Spent', 'Reason']],
    body: data.map((row) => [
      formatDate(row.transaction_date),
      row.transaction_type,
      row.points,
      row.amount_spent ?? '-',
      row.reason ?? '-',
    ]),
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [26, 43, 71], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save(`${filename}.pdf`);
}
