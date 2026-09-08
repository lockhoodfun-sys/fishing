// Cron endpoint: samples on-chain hold value for eligibility-relevant wallets
// so fish_hold_snapshots has continuous coverage even for players who don't
// happen to open the Gold/NPC panel during a given window. Without this,
// resolve_windowed_tier() only sees data whenever a player *chooses* to
// trigger a check — which a wallet gaming the system could simply avoid
// doing while its balance is temporarily low, poisoning the window with only
// favorable samples.
//
// Auth follows the same pattern as every other scheduled job in this project
// (see src/integrations/supabase/cron-auth.ts) — a Bearer token checked with
// a timing-safe comparison against LOVABLE_CRON_SECRET(_PREVIOUS).
//
// Suggested schedule: every 30–60 minutes. resolveHoldStatus() itself also
// records a snapshot on every player-triggered check, so this cron mainly
// fills the gaps for wallets that don't check in on their own.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// How long to keep old snapshots around. Must be comfortably longer than the
// largest fish_hold_tiers.min_hold_hours (currently 72h/tier_2000) so no
// tier's window ever runs out of history mid-check.
const SNAPSHOT_RETENTION_DAYS = 8;

async function sampleEligibleWallets() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveHoldStatus } = await import("@/lib/onchain.server");

  const minLevelRes = await supabaseAdmin
    .from("npc_reward_config")
    .select("value")
    .eq("key", "min_level")
    .single();
  const minLevel = minLevelRes.data ? Number(minLevelRes.data.value) : 5;

  // Only wallets that could plausibly need a resolved tier right now: high
  // enough level to reach the NPC, or already holding a gold balance (which
  // covers admin-granted gold too, not just NPC-earned).
  const profilesRes = await supabaseAdmin
    .from("profiles")
    .select("wallet_address")
    .or(`level.gte.${minLevel},gold.gt.0`);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const wallets = (profilesRes.data ?? []).map((p) => p.wallet_address as string);

  let sampled = 0;
  let failed = 0;
  // Sequential on purpose — fetchTokenBalance hits the chain RPC per wallet,
  // and fetchTokenPriceUsd is cached 60s globally, so this keeps request
  // volume against the RPC endpoint predictable rather than bursting it.
  for (const wallet of wallets) {
    try {
      await resolveHoldStatus(wallet);
      sampled++;
    } catch (error) {
      failed++;
      console.error("[cron/hold-snapshot] failed for wallet", wallet, error);
    }
  }

  const pruneCutoff = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // fish_hold_snapshots isn't in the generated Database type yet — same
  // bypass pattern used elsewhere for tables/functions not synced into
  // types.ts.
  const pruneRes = await (supabaseAdmin.from as any)("fish_hold_snapshots")
    .delete()
    .lt("sampled_at", pruneCutoff.toISOString());

  return { sampled, failed, totalWallets: wallets.length, pruneError: pruneRes.error?.message ?? null };
}

export const Route = createFileRoute("/api/cron/hold-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        try {
          const result = await sampleEligibleWallets();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error("[cron/hold-snapshot]", error);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
