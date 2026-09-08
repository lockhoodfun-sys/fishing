// Server-only. Never import from a *.functions.ts or route file that ships to
// the client bundle — this touches an RPC endpoint and an external price API.
//
// Resolves a wallet's "hold value" in USD for the placeholder $FISH-style
// token on the Robinhood chain, then maps that value to a row in
// fish_hold_tiers. This is the ONLY place on-chain state or GeckoTerminal
// pricing is read; Postgres functions never talk to the chain themselves —
// they take the resolved tier id as a parameter.
import { createPublicClient, http, formatUnits } from "viem";
import { robinhoodChain } from "./chains";
import { rpc } from "./rpc";

// Placeholder token (per approved plan, §0.2) — not the real $FISH, which
// hasn't launched yet. Swap this constant when the real token goes live.
const HOLD_TOKEN_ADDRESS = "0x39dBED3a2bd333467115dE45665cC57F813C4571" as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

let _client: ReturnType<typeof createPublicClient> | undefined;
function getClient() {
  if (!_client) {
    _client = createPublicClient({ chain: robinhoodChain, transport: http() });
  }
  return _client;
}

/** In-memory price cache — GeckoTerminal has real rate limits and the price
 * doesn't need sub-minute freshness for a hold-value gate. */
let _priceCache: { value: number; fetchedAt: number } | undefined;
const PRICE_CACHE_MS = 60_000;

async function fetchTokenPriceUsd(): Promise<number> {
  if (_priceCache && Date.now() - _priceCache.fetchedAt < PRICE_CACHE_MS) {
    return _priceCache.value;
  }

  const url = `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${HOLD_TOKEN_ADDRESS}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GeckoTerminal price lookup failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: { attributes?: { price_usd?: string | number | null } };
  };
  const raw = json.data?.attributes?.price_usd;
  const price = raw == null ? 0 : Number(raw);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("GeckoTerminal returned an invalid price");
  }

  _priceCache = { value: price, fetchedAt: Date.now() };
  return price;
}

async function fetchTokenBalance(walletAddress: string): Promise<number> {
  const client = getClient();
  const [rawBalance, decimals] = await Promise.all([
    client.readContract({
      address: HOLD_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    }),
    client.readContract({
      address: HOLD_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  ]);
  return Number(formatUnits(rawBalance, decimals));
}

export interface HoldTier {
  id: string;
  min_usd_value: number;
  generation_cap_gold: number | null;
  wd_min: number | null;
  wd_max: number | null;
  wd_per_day: number;
  /** Hours the wallet's balance must stay >= min_usd_value, continuously
   *  and provably (via fish_hold_snapshots), before this tier is granted.
   *  See 0010_hold_tier_time_window.sql. */
  min_hold_hours: number;
}

export interface HoldStatus {
  /** Current instantaneous hold value — for display only. */
  usdValue: number;
  /** The GATING tier — requires min_hold_hours of continuous proven holding.
   *  This is what NPC reward claims and withdrawals must use. Never gate
   *  anything on instantTier below. */
  tier: HoldTier | null;
  /** Tier the wallet's balance would reach RIGHT NOW, ignoring how long
   *  it's been held. Display-only — e.g. "you're at Tier X now, eligible in
   *  ~N hours if it stays there." Never trust this for access control. */
  instantTier: HoldTier | null;
}

/** Best-effort snapshot write for the time-window check. Never let a logging
 * failure block a balance read — the player still gets their (accurate)
 * instant value even if this insert fails. */
async function recordSnapshot(wallet: string, usdValue: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // fish_hold_snapshots isn't in the generated Database type yet — same
    // bypass pattern as rpc.ts for functions not yet synced into types.ts.
    await (supabaseAdmin.from as any)("fish_hold_snapshots").insert({
      wallet_address: wallet,
      usd_value: usdValue,
    });
  } catch {
    /* non-fatal — see comment above */
  }
}

/** Reads the wallet's live token balance + price, resolves it against
 * fish_hold_tiers, records a snapshot for the holding-duration check, and
 * resolves the actual (windowed) gating tier via resolve_windowed_tier(). */
export async function resolveHoldStatus(walletAddress: string): Promise<HoldStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const wallet = walletAddress.toLowerCase();

  const [balance, priceUsd, tiersRes] = await Promise.all([
    fetchTokenBalance(walletAddress),
    fetchTokenPriceUsd(),
    supabaseAdmin
      .from("fish_hold_tiers")
      .select("*")
      .order("sort_order", { ascending: false }),
  ]);

  if (tiersRes.error) throw new Error(tiersRes.error.message);
  const tiers = (tiersRes.data ?? []) as unknown as HoldTier[];

  const usdValue = balance * priceUsd;
  const instantTier = tiers.find((t) => usdValue >= t.min_usd_value) ?? null;

  await recordSnapshot(wallet, usdValue);

  const windowed = await rpc<string | null>("resolve_windowed_tier", { _wallet: wallet });
  const windowedTierId = windowed.error ? null : windowed.data;
  const tier = windowedTierId ? (tiers.find((t) => t.id === windowedTierId) ?? null) : null;

  return { usdValue, tier, instantTier };
}