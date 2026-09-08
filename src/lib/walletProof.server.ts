import { buildAuthMessage, SIGNATURE_MAX_AGE_MS } from "./walletAuth";

export interface WalletProofInput {
  address: string;
  issuedAt: string;
  signature: string;
}

/** Verifies the wallet signature and returns the lowercase address it proves. */
export async function verifyWalletProof(proof: WalletProofInput): Promise<string> {
  const issued = Date.parse(proof.issuedAt);
  if (Number.isNaN(issued) || Math.abs(Date.now() - issued) > SIGNATURE_MAX_AGE_MS) {
    throw new Error("Signature expired. Please reconnect your wallet.");
  }
  const { verifyMessage } = await import("viem");
  const ok = await verifyMessage({
    address: proof.address as `0x${string}`,
    message: buildAuthMessage(proof.address, proof.issuedAt),
    signature: proof.signature as `0x${string}`,
  });
  if (!ok) throw new Error("Invalid wallet signature.");
  return proof.address.toLowerCase();
}
