import { createServerFn } from "@tanstack/react-start";

// Server-side cache so every client does not hammer the public price API.
let cached: { usd: number; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export const getEthPrice = createServerFn({ method: "GET" }).handler(async () => {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { usd: cached.usd };
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`price API ${res.status}`);
    const json = (await res.json()) as { ethereum?: { usd?: number } };
    const usd = json.ethereum?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd)) throw new Error("bad price payload");
    cached = { usd, at: Date.now() };
    return { usd };
  } catch {
    // On failure, return the stale value if we have one; otherwise null so the
    // UI just hides the USD line instead of breaking.
    return { usd: cached?.usd ?? null };
  }
});
