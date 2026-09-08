import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Typed RPC helper that bypasses the generated Database type for functions
 * that exist in the live backend but haven't been synced into types.ts yet.
 */
export async function rpc<T = unknown>(
  name: string,
  args?: Record<string, unknown>
): Promise<{ data: T | null; error: { message: string } | null }> {
  const res = await (supabaseAdmin.rpc as any)(name, args);
  return res as { data: T | null; error: { message: string } | null };
}
