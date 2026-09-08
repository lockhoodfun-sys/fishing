import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletProfile } from "@/hooks/useWalletProfile";
import { useAdminStore } from "@/hooks/useAdminStore";
import { robinhoodChain } from "@/lib/chains";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — Withdrawals" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { authenticate, proof } = useWalletProfile();

  const withdrawals = useAdminStore((s) => s.withdrawals);
  const loading = useAdminStore((s) => s.loading);
  const authorized = useAdminStore((s) => s.authorized);
  const busyId = useAdminStore((s) => s.busyId);
  const error = useAdminStore((s) => s.error);
  const refresh = useAdminStore((s) => s.refresh);
  const markWithdrawal = useAdminStore((s) => s.markWithdrawal);

  const [txHashById, setTxHashById] = useState<Record<string, string>>({});
  const [authenticating, setAuthenticating] = useState(false);

  useEffect(() => {
    if (proof) void refresh(proof);
  }, [proof, refresh]);

  const connector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  const onConnectAndVerify = async () => {
    setAuthenticating(true);
    try {
      if (!isConnected) {
        if (!connector) return;
        connect({ connector, chainId: robinhoodChain.id });
        return; // proof is requested automatically once connected (useWalletProfile effect)
      }
      await authenticate();
    } finally {
      setAuthenticating(false);
    }
  };

  const onApprove = async (id: string) => {
    if (!proof) return;
    const txHash = (txHashById[id] ?? "").trim();
    if (!txHash) {
      toast.error("Enter the transaction hash before approving.");
      return;
    }
    const ok = await markWithdrawal(proof, id, true, txHash);
    if (ok) toast.success("Marked as paid.");
    else toast.error(useAdminStore.getState().error ?? "Could not approve.");
  };

  const onReject = async (id: string) => {
    if (!proof) return;
    const ok = await markWithdrawal(proof, id, false);
    if (ok) toast.success("Rejected — gold refunded to the player.");
    else toast.error(useAdminStore.getState().error ?? "Could not reject.");
  };

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Withdrawal Admin</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pending gold withdrawal requests. Approving requires the on-chain transaction hash of
        the ETH payout you sent manually.
      </p>

      {!proof ? (
        <div className="mt-8 flex flex-col items-start gap-3 rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">
            Connect the admin wallet and sign to continue. Access is checked on the server —
            connecting a non-admin wallet will simply show an access-denied message below.
          </p>
          <Button onClick={onConnectAndVerify} disabled={connecting || authenticating}>
            {(connecting || authenticating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Wallet className="mr-2 h-4 w-4" aria-hidden />
            {isConnected ? "Sign to verify" : "Connect wallet"}
          </Button>
        </div>
      ) : authorized === false ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
          <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden />
          <p className="text-sm font-semibold text-destructive">Access denied</p>
          <p className="text-xs text-muted-foreground">
            This wallet is not the configured admin wallet.
          </p>
        </div>
      ) : loading && withdrawals.length === 0 ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading pending withdrawals…
        </p>
      ) : withdrawals.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No pending withdrawals. All caught up.</p>
      ) : (
        <div className="mt-8 space-y-3">
          {withdrawals.map((w) => (
            <div key={w.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-muted-foreground">{w.wallet_address}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(w.requested_at).toLocaleString()}
                </p>
              </div>
              <p className="mt-1 text-lg font-bold tabular-nums text-amber-600">
                {Number(w.gold_amount).toLocaleString()} gold
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  placeholder="0x… transaction hash"
                  className="max-w-xs font-mono text-xs"
                  value={txHashById[w.id] ?? ""}
                  onChange={(e) => setTxHashById((prev) => ({ ...prev, [w.id]: e.target.value }))}
                />
                <Button size="sm" disabled={busyId === w.id} onClick={() => onApprove(w.id)}>
                  {busyId === w.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Mark paid
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId === w.id}
                  onClick={() => onReject(w.id)}
                >
                  Reject &amp; refund
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
