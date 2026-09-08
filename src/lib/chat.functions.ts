import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildAuthMessage, SIGNATURE_MAX_AGE_MS } from "./walletAuth";
import type { Tables } from "@/integrations/supabase/types";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

type Proof = z.infer<typeof proofSchema>;

/** Verifies the wallet signature and returns the lowercase address it proves. */
async function verifyProof(proof: Proof): Promise<string> {
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

export type ChatMessage = Tables<"chat_messages">;

const sendSchema = z.object({
  proof: proofSchema,
  message: z.string().trim().min(1, "Message can't be empty.").max(240, "Message is too long."),
});

/**
 * Sends a chat message. Cooldown, profile lookup, and length checks all
 * happen server-side in send_chat_message so they can't be bypassed by a
 * modified client — see drizzle/migrations/0013_leaderboard_and_chat.sql.
 * Reading messages does NOT go through here: the chat feed is public, so
 * the client reads/subscribes to `chat_messages` directly (see
 * useChatStore.ts) the same way it reads other public tables like
 * fish_species.
 */
export const sendChatMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data }): Promise<ChatMessage> => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .rpc("send_chat_message", { _wallet: wallet, _message: data.message })
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data as ChatMessage;
  });
