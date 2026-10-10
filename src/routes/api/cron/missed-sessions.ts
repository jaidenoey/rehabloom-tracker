// POST /api/cron/missed-sessions — called once a day by a Lovable scheduled job.
// Protected by the LOVABLE_CRON_SECRET bearer token.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/missed-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { runMissedSessionJob } = await import("@/lib/missed-sessions.server");
        const appUrl = process.env["APP_URL"] ?? new URL(request.url).origin;
        try {
          const summary = await runMissedSessionJob(appUrl);
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          console.error("[alerts] job failed", e);
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
