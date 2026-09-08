import { defineChain } from "viem";

/**
 * FISH token contract on Robinhood Chain. Not deployed yet — set this to the
 * real address once the contract is live to enable on-chain FISH balances.
 */
export const FISH_TOKEN_ADDRESS: `0x${string}` | null = null;

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});
