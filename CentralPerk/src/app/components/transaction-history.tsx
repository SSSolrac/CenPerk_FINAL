import { useState } from 'react';
import { History, Download, FileDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  exportToCSV,
  exportToPDF,
  fetchTransactionsForExport,
} from '../lib/transaction-exports';

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: 'earned' | 'redeemed' | 'expired';
  points: number;
  balance: number;
}

interface TransactionHistoryProps {
  transactions: Transaction[];
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const [filter, setFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isGeneratingCSV, setIsGeneratingCSV] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const itemsPerPage = 10;

  // Filter transactions
  const filteredTransactions = transactions.filter((transaction) => {
    if (filter === 'all') return true;
    return transaction.type === filter;
  });

  // Sort transactions
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  // Paginate
  const totalPages = Math.ceil(sortedTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

  const handleSort = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  const handleDownloadPDF = async () => {
    try {
      setIsGeneratingPDF(true);
      const exportData = await fetchTransactionsForExport();
      exportToPDF(exportData, `transaction-report-${new Date().toISOString().split('T')[0]}`);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      toast.error('Unable to generate PDF.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      setIsGeneratingCSV(true);
      const exportData = await fetchTransactionsForExport();
      exportToCSV(exportData, `transaction-report-${new Date().toISOString().split('T')[0]}`);
      toast.success('CSV downloaded successfully!');
    } catch (error) {
      toast.error('Unable to generate CSV.', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsGeneratingCSV(false);
    }
  };

  const getTypeBadge = (type: string, points: number) => {
    switch (type) {
      case 'earned':
        return (
          <Badge className="bg-[#e9edf5] text-[#23385a] border-[#1A2B47]/30">
            +{points.toLocaleString()}
          </Badge>
        );
      case 'redeemed':
        return (
          <Badge className="bg-red-100 text-red-700 border-red-300">
            -{points.toLocaleString()}
          </Badge>
        );
      case 'expired':
        return (
          <Badge className="bg-gray-100 text-gray-700 border-gray-300">
            -{points.toLocaleString()}
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#1A2B47]" />
                Points Transaction History
              </CardTitle>
              <CardDescription>Recent rewards activity</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="earned">Earned</SelectItem>
                  <SelectItem value="redeemed">Redeemed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF || isGeneratingCSV}
                className="gap-2"
              >
                <FileDown className="w-4 h-4" />
                {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCSV}
                disabled={isGeneratingPDF || isGeneratingCSV}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {isGeneratingCSV ? 'Generating...' : 'Download CSV'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>
                    <button
                      onClick={handleSort}
                      className="flex items-center gap-1 hover:text-[#1A2B47] transition-colors"
                    >
                      Date
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  </TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTransactions.map((transaction, index) => (
                    <motion.tr
                      key={transaction.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <TableCell className="font-medium">{transaction.date}</TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell>
                        <span className="capitalize text-sm text-gray-600">
                          {transaction.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {getTypeBadge(transaction.type, transaction.points)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {transaction.balance.toLocaleString()}
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedTransactions.length)} of{' '}
                {sortedTransactions.length} transactions
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className={
                        currentPage === page
                          ? 'bg-gradient-to-r from-[#1A2B47] to-[#1A2B47] text-white'
                          : ''
                      }
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
