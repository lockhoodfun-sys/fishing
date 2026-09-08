import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useGoldStore } from "@/hooks/useGoldStore";

function statusTone(status: string) {
  if (status === "paid") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "rejected" || status === "expired") return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  if (status === "cancelled") return "border-muted-foreground/30 bg-muted text-muted-foreground";
  return "border-amber-500/40 bg-amber-500/10 text-amber-300";
}

export function GoldPanel() {
  const proof = useProfileStore((s) => s.proof);
  const profile = useProfileStore((s) => s.profile);
  const panelOpen = useGoldStore((s) => s.panelOpen);
  const setPanelOpen = useGoldStore((s) => s.setPanelOpen);
  const hold = useGoldStore((s) => s.hold);
  const holdLoading = useGoldStore((s) => s.holdLoading);
  const withdrawals = useGoldStore((s) => s.withdrawals);
  const submitting = useGoldStore((s) => s.submitting);
  const storeError = useGoldStore((s) => s.error);
  const refresh = useGoldStore((s) => s.refresh);
  const requestWithdrawal = useGoldStore((s) => s.requestWithdrawal);
  const cancelWithdrawal = useGoldStore((s) => s.cancelWithdrawal);

  const [amount, setAmount] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (panelOpen && proof) void refresh();
  }, [panelOpen, proof, refresh]);

  const goldBalance = Number(profile?.gold ?? 0);
  const tier = hold?.tier ?? null;

  // Same "how many withdrawals used today" count the SQL side enforces
  // (status pending/paid, requested today) — shown here purely so the
  // player understands the limit before hitting it server-side.
  const usedToday = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return withdrawals.filter(
      (w) => (w.status === "pending" || w.status === "paid") && new Date(w.requested_at) >= startOfDay,
    ).length;
  }, [withdrawals]);

  const parsedAmount = Number(amount);
  const validationError = (() => {
    if (!amount) return null;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return "Enter a positive amount.";
    if (!tier) return "You don't hold enough of the tracked token to withdraw yet.";
    if (parsedAmount > goldBalance) return "You don't have that much gold.";
    if (tier.wd_min != null && parsedAmount < tier.wd_min) return `Minimum withdrawal for your tier is ${tier.wd_min} gold.`;
    if (tier.wd_max != null && parsedAmount > tier.wd_max) return `Maximum withdrawal for your tier is ${tier.wd_max} gold.`;
    if (usedToday >= tier.wd_per_day) return `You've used all ${tier.wd_per_day} withdrawal(s) for today.`;
    return null;
  })();

  const onSubmit = async () => {
    if (validationError || !amount) return;
    const ok = await requestWithdrawal(parsedAmount);
    if (ok) {
      toast.success("Withdrawal requested. An admin will process it soon.");
      setAmount("");
    } else {
      toast.error(useGoldStore.getState().error ?? "The withdrawal request failed.");
    }
  };

  const onCancel = async (withdrawalId: string) => {
    setCancellingId(withdrawalId);
    const ok = await cancelWithdrawal(withdrawalId);
    if (ok) {
      toast.success("Withdrawal cancelled — gold refunded.");
    } else {
      toast.error(useGoldStore.getState().error ?? "Could not cancel the withdrawal.");
    }
    setCancellingId(null);
  };

  return (
    <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-400" aria-hidden />
            Gold Wallet
          </DialogTitle>
          <DialogDescription>
            Gold earned from the reward NPC, convertible to ETH.
          </DialogDescription>
        </DialogHeader>

        {!proof ? (
          <p className="text-sm text-muted-foreground">Connect your wallet to view your gold.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm text-muted-foreground">Gold balance</span>
              <span className="text-lg font-bold tabular-nums text-amber-400">
                {goldBalance.toLocaleString()}
              </span>
            </div>

            <div className="rounded-lg border border-border px-3 py-2.5 text-sm">
              {holdLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your hold value…
                </p>
              ) : tier ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Hold tier</span>
                    <Badge variant="secondary">{tier.id}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Token value held</span>
                    <span className="tabular-nums">${hold?.usdValue.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Withdraw range</span>
                    <span className="tabular-nums">
                      {tier.wd_min ?? 0}–{tier.wd_max ?? "∞"} gold
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Withdrawals today</span>
                    <span className="tabular-nums">
                      {usedToday}/{tier.wd_per_day}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Hold at least $10 worth of the tracked token to unlock withdrawals.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="withdraw-amount">Withdraw amount (gold)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {validationError && <p className="text-xs text-destructive">{validationError}</p>}
            </div>

            <Button
              className="w-full"
              disabled={!amount || !!validationError || submitting}
              onClick={onSubmit}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Request withdrawal
            </Button>

            {storeError && !validationError && (
              <p className="text-xs text-destructive">{storeError}</p>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Withdrawal history</p>
              {withdrawals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No withdrawals yet.</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {withdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                    >
                      <span className="tabular-nums font-semibold">{Number(w.gold_amount).toLocaleString()} gold</span>
                      <span className="text-muted-foreground">
                        {new Date(w.requested_at).toLocaleDateString()}
                      </span>
                      <span className={`rounded-md border px-1.5 py-0.5 font-semibold ${statusTone(w.status)}`}>
                        {w.status}
                      </span>
                      {w.status === "pending" && (
                        <button
                          type="button"
                          className="text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
                          disabled={cancellingId === w.id}
                          onClick={() => onCancel(w.id)}
                        >
                          {cancellingId === w.id ? "Cancelling…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}