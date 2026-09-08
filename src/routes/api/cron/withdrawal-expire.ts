// Cron endpoint: refunds and expires `pending` withdrawal requests that have
// sat unprocessed longer than game_config.withdrawal_expire_hours (default
// 168h / 7 days, tweakable without a redeploy).
//
// Auth follows the exact same pattern as every other scheduled job in this
// project (see src/integrations/supabase/cron-auth.ts) — a Bearer token
// checked with a timing-safe comparison against LOVABLE_CRON_SECRET(_PREVIOUS).
//
// NOTE: a player is never stuck waiting on this — cancel_withdrawal() lets
// them refund a still-pending request themselves at any time. This cron is
// the fallback for requests nobody (player or admin) ever acted on.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function expireStaleWithdrawals() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const res = await (supabaseAdmin.rpc as any)("expire_stale_withdrawals");
  if (res.error) throw new Error(res.error.message);

  return { expired: res.data as number };
}

export const Route = createFileRoute("/api/cron/withdrawal-expire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        try {
          const result = await expireStaleWithdrawals();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          console.error("[cron/withdrawal-expire]", error);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
