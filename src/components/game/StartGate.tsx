import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import { Wallet, UserRound } from "lucide-react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/chains";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useWalletProfile } from "@/hooks/useWalletProfile";

/**
 * Card shown centre-top once loading finishes: the player must connect their
 * wallet and have a profile before playing. It closes itself as soon as the
 * profile is ready, and never blocks the running game systems.
 */
export function StartGate() {
  const { progress, active } = useProgress();
  const [ready, setReady] = useState(false);

  const { isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { authenticate } = useWalletProfile();
  const profile = useProfileStore((s) => s.profile);
  const loading = useProfileStore((s) => s.loading);
  const setPanelOpen = useProfileStore((s) => s.setPanelOpen);

  useEffect(() => {
    if (!active && progress >= 100) {
      const t = window.setTimeout(() => setReady(true), 1200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [active, progress]);

  if (!ready || profile) return null;

  const connector = connectors.find((c) => c.id === "injected") ?? connectors[0];
  const wrongNetwork = isConnected && chainId !== robinhoodChain.id;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/20 bg-slate-900/75 p-5 text-center shadow-2xl backdrop-blur-md">
        {!isConnected ? (
          <>
            <Wallet className="mx-auto mb-2 h-6 w-6 text-sky-300" aria-hidden />
            <h2 className="text-base font-semibold text-slate-50">Connect your wallet to play</h2>
            <p className="mt-1 text-xs text-slate-300">
              Your catches, coins and gear are saved to your wallet. Without it, nothing is kept.
            </p>
            <button
              type="button"
              disabled={isPending || !connector}
              onClick={() => connector && connect({ connector, chainId: robinhoodChain.id })}
              className="mt-4 w-full rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:opacity-60"
            >
              {isPending ? "Connecting…" : "Connect wallet"}
            </button>
          </>
        ) : wrongNetwork ? (
          <>
            <Wallet className="mx-auto mb-2 h-6 w-6 text-amber-300" aria-hidden />
            <h2 className="text-base font-semibold text-slate-50">Switch network to play</h2>
            <p className="mt-1 text-xs text-slate-300">This game runs on Robinhood Chain.</p>
            <button
              type="button"
              disabled={switching}
              onClick={() => switchChain({ chainId: robinhoodChain.id })}
              className="mt-4 w-full rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-60"
            >
              {switching ? "Switching…" : "Switch to Robinhood Chain"}
            </button>
          </>
        ) : (
          <>
            <UserRound className="mx-auto mb-2 h-6 w-6 text-emerald-300" aria-hidden />
            <h2 className="text-base font-semibold text-slate-50">Set up your profile</h2>
            <p className="mt-1 text-xs text-slate-300">
              Sign the ownership message to create your angler profile and claim your free Starter
              Rod and Basic Bait.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                const ok = await authenticate();
                if (ok) setPanelOpen(true);
              }}
              className="mt-4 w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading ? "Preparing…" : "Set up profile"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
