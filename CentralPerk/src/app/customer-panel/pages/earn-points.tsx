import { useEffect, useMemo, useState } from "react";
import { Check, User, Smartphone, Clipboard, Users, Share2, Star, ShoppingCart, Receipt, FileText } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { toast } from "sonner";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../../types/app-context";
import { normalizeTierLabel } from "../../lib/loyalty-engine";
import { awardMemberPoints, calculateDynamicPurchasePoints, loadEarnTasks } from "../../lib/loyalty-supabase";
import type { EarnOpportunity } from "../../types/loyalty";

export default function EarnPoints() {
  const { user, refreshUser, completedTaskIds, setCompletedTaskIds } = useOutletContext<AppOutletContext>();
  const [tasks, setTasks] = useState<EarnOpportunity[]>([]);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEarnTasks()
      .then((rows) => setTasks(rows))
      .catch(() => setTasks([]));
  }, []);

  const completedSet = useMemo(() => new Set(completedTaskIds), [completedTaskIds]);

  const completeTask = async (taskId: string, title: string, points: number) => {
    try {
      setSaving(true);
      await awardMemberPoints({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points,
        transactionType: "MANUAL_AWARD",
        reason: `Task completed (${taskId}): ${title}`,
      });

      setCompletedTaskIds((prev) => [...new Set([...prev, taskId])]);
      await refreshUser();
      toast.success(`${title} completed! +${points} points`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete task");
    } finally {
      setSaving(false);
    }
  };

  const handleSurveyComplete = async () => {
    await completeTask("E003", "Survey Completion", 50);
    setSurveyOpen(false);
  };

  const handlePurchase = async () => {
    const amount = parseFloat(purchaseAmount);
    if (!(amount > 0)) return;
    const pointsEarned = await calculateDynamicPurchasePoints({
      amountSpent: amount,
      tier: normalizeTierLabel(user.tier),
    });

    try {
      setSaving(true);
      await awardMemberPoints({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points: pointsEarned,
        transactionType: "PURCHASE",
        reason: `Purchase of $${amount.toFixed(2)}`,
        amountSpent: amount,
      });

      await refreshUser();
      toast.success(`Purchase recorded! +${pointsEarned} points`, {
        description: `Earned from $${amount.toFixed(2)} purchase`,
      });
      setReceiptOpen(false);
      setPurchaseAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Purchase failed");
    } finally {
      setSaving(false);
    }
  };

  const purchaseValue = parseFloat(purchaseAmount || "0");
  const [projectedPointsEarned, setProjectedPointsEarned] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      if (!(purchaseValue > 0)) {
        if (!cancelled) setProjectedPointsEarned(0);
        return;
      }
      try {
        const next = await calculateDynamicPurchasePoints({
          amountSpent: purchaseValue,
          tier: normalizeTierLabel(user.tier),
        });
        if (!cancelled) setProjectedPointsEarned(next);
      } catch {
        if (!cancelled) setProjectedPointsEarned(0);
      }
    };

    compute();
    return () => {
      cancelled = true;
    };
  }, [purchaseValue, user.tier]);

  const projectedPostPurchaseBalance = user.points + projectedPointsEarned;

  const getIcon = (iconName: string) => {
    const icons: Record<string, any> = {
      user: User,
      smartphone: Smartphone,
      clipboard: Clipboard,
      users: Users,
      "share-2": Share2,
      star: Star,
    };
    return icons[iconName] || User;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Earn Points</h1>
        <p className="text-gray-500 mt-1">Complete tasks and make purchases to earn more rewards</p>
      </div>

      <Card className="p-6 bg-gradient-to-br from-[#1A2B47] to-[#1A2B47] text-white border-0">
        <h2 className="text-xl font-bold mb-4">How to Earn Points</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><ShoppingCart className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Make Purchases</h3><p className="text-[#b9f6ff] text-sm">Earn 1 point for every $1 spent automatically</p></div></div>
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Clipboard className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Complete Tasks</h3><p className="text-[#b9f6ff] text-sm">Surveys, reviews, and more</p></div></div>
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Refer Friends</h3><p className="text-[#b9f6ff] text-sm">Both get 250 points</p></div></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow border-[#9ed8ff]/60 bg-[#f7fbff]" onClick={() => setReceiptOpen(true)}>
          <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center"><Receipt className="w-6 h-6 text-[#2563eb]" /></div><div><h3 className="font-semibold text-gray-900">Record Purchase</h3><p className="text-sm text-gray-500">Earn points instantly</p></div></div>
          <p className="text-sm text-gray-600">Record your purchase and points are saved to database + reflected in all pages.</p>
        </Card>

        <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow border-[#9ed8ff]/60 bg-[#f7fbff]" onClick={() => setSurveyOpen(true)}>
          <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center"><FileText className="w-6 h-6 text-[#2563eb]" /></div><div><h3 className="font-semibold text-gray-900">Complete Survey</h3><p className="text-sm text-gray-500">Quick feedback form</p></div></div>
          <p className="text-sm text-gray-600">Share your experience and earn 50 points.</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Tasks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((opportunity) => {
            const Icon = getIcon(opportunity.icon);
            const completed = completedSet.has(opportunity.id) || opportunity.completed;
            return (
              <Card key={opportunity.id} className={completed ? "bg-gray-50/60" : "bg-white"}>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${completed ? "bg-gray-100" : "bg-[#dbeafe]"}`}>
                        {completed ? <Check className="w-6 h-6 text-gray-400" /> : <Icon className="w-6 h-6 text-[#1A2B47]" />}
                      </div>
                      <div className="flex-1"><h3 className="font-semibold text-gray-900 mb-1">{opportunity.title}</h3><p className="text-sm text-gray-600">{opportunity.description}</p></div>
                    </div>
                    <div className="text-right ml-4"><div className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${completed ? "bg-gray-100 text-gray-600" : "bg-[#dbeafe] text-[#0b6cb8]"}`}>+{opportunity.points}</div></div>
                  </div>
                  {!completed && (
                    <Button
                      className="w-full bg-[#1A2B47] hover:bg-[#23385a] text-white"
                      disabled={saving}
                      onClick={() => completeTask(opportunity.id, opportunity.title, opportunity.points)}
                    >
                      Start Task
                    </Button>
                  )}
                  {completed && <div className="flex items-center gap-2 text-sm text-gray-500"><Check className="w-4 h-4" /><span>Completed</span></div>}
                </div>
              </Card>
            );
          })}
        </div>
        {tasks.length === 0 && (
          <Card className="p-6 border-dashed border-gray-300">
            <p className="text-sm text-gray-600">
              No earn tasks found in database. Add rows to <code>earn_tasks</code> to show task-based earning.
            </p>
          </Card>
        )}
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Recent Purchases</h3>
        <div className="space-y-3">
          {user.transactions
            .filter((t) => t.type === "earned" && t.receiptId)
            .slice(0, 5)
            .map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3"><div className="w-10 h-10 bg-[#dbeafe] rounded-lg flex items-center justify-center"><Receipt className="w-5 h-5 text-[#2563eb]" /></div><div><p className="font-medium text-gray-900">{transaction.description}</p><p className="text-sm text-gray-500">{new Date(transaction.date).toLocaleDateString()} - {transaction.receiptId}</p></div></div>
                <div className="text-right"><p className="font-semibold text-[#1A2B47]">+{transaction.points}</p><p className="text-sm text-gray-500">points earned</p></div>
              </div>
            ))}
        </div>
      </Card>

      <Dialog open={surveyOpen} onOpenChange={setSurveyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Feedback Survey</DialogTitle>
            <DialogDescription>Help us improve your experience and earn 50 points</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>How would you rate your recent experience?</Label><div className="flex gap-2 mt-2">{[1, 2, 3, 4, 5].map((rating) => (<button key={rating} className="w-12 h-12 rounded-lg border-2 border-gray-200 hover:border-[#1A2B47] transition-colors flex items-center justify-center font-semibold">{rating}</button>))}</div></div>
            <div><Label htmlFor="feedback">What can we improve?</Label><Textarea id="feedback" placeholder="Share your thoughts..." className="mt-2" rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSurveyOpen(false)}>Cancel</Button>
            <Button className="bg-[#1A2B47] hover:bg-[#23385a] text-white" onClick={handleSurveyComplete} disabled={saving}>Submit & Earn 50 Points</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Purchase</DialogTitle>
            <DialogDescription>Enter your purchase amount to earn points automatically (1 point per $1)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label htmlFor="amount">Purchase Amount ($)</Label><Input id="amount" type="number" step="0.01" placeholder="0.00" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} className="mt-2" /></div>
            {projectedPointsEarned > 0 && (
              <div className="p-4 rounded-lg bg-[#f5f7fb] border border-[#1A2B47]/30">
                <div className="flex items-center justify-between mb-2"><span className="text-sm text-gray-600">Purchase Amount</span><span className="font-semibold text-gray-900">${purchaseValue.toFixed(2)}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Points to Earn</span><span className="font-bold text-[#1A2B47] text-lg">+{projectedPointsEarned}</span></div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1A2B47]/30"><span className="text-sm text-gray-600">Projected Point Balance</span><span className="font-semibold text-gray-900">{projectedPostPurchaseBalance.toLocaleString()}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>Cancel</Button>
            <Button className="bg-[#1A2B47] hover:bg-[#23385a] text-white" onClick={handlePurchase} disabled={saving || !purchaseAmount || parseFloat(purchaseAmount) <= 0}>Record Purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


