// Server functions behind the /support/$token page that support contacts open from their SMS.
// Contacts are not logged in: the unguessable token in the link is their only credential,
// so every function looks the alert up by token on the server and never trusts other input.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  displayName,
  isLinkExpired,
  MAX_NOTE_LENGTH,
  MAX_PROPOSALS_PER_ALERT,
  validateProposal,
} from "@/lib/alerts";

const tokenSchema = z.string().uuid();

async function loadAlert(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: alert } = await supabaseAdmin
    .from("alert_events" as never)
    .select("id, patient_id, contact_id, missed_days, created_at")
    .eq("token", token)
    .maybeSingle();
  return {
    db: supabaseAdmin,
    alert: alert as {
      id: string;
      patient_id: string;
      contact_id: string;
      missed_days: number;
      created_at: string;
    } | null,
  };
}

export type SupportRequest =
  | { status: "not_found" | "expired" }
  | {
      status: "ok";
      patientName: string;
      contactName: string;
      missedDays: number;
      patientPhone: string;
      sessions: { id: string; proposedFor: string; note: string; status: string }[];
      canPropose: boolean;
    };

export const getSupportRequest = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => ({ token: tokenSchema.parse(data.token) }))
  .handler(async ({ data }): Promise<SupportRequest> => {
    const { db, alert } = await loadAlert(data.token);
    if (!alert) return { status: "not_found" };
    if (isLinkExpired(alert.created_at)) return { status: "expired" };

    const [{ data: user }, contact, profile, sessions] = await Promise.all([
      db.auth.admin.getUserById(alert.patient_id),
      db
        .from("support_contacts" as never)
        .select("name")
        .eq("id", alert.contact_id)
        .maybeSingle(),
      db
        .from("support_profiles" as never)
        .select("phone")
        .eq("user_id", alert.patient_id)
        .maybeSingle(),
      db
        .from("shared_sessions" as never)
        .select("id, proposed_for, note, status")
        .eq("alert_id", alert.id)
        .order("proposed_for"),
    ]);

    const meta = user.user?.user_metadata as { full_name?: string; name?: string } | undefined;
    const rows = (sessions.data ?? []) as {
      id: string;
      proposed_for: string;
      note: string;
      status: string;
    }[];
    return {
      status: "ok",
      patientName: displayName(meta?.full_name ?? meta?.name, user.user?.email),
      contactName: displayName((contact.data as { name?: string } | null)?.name, null),
      missedDays: alert.missed_days,
      patientPhone: (profile.data as { phone?: string } | null)?.phone ?? "",
      sessions: rows.map((r) => ({
        id: r.id,
        proposedFor: r.proposed_for,
        note: r.note,
        status: r.status,
      })),
      canPropose: rows.length < MAX_PROPOSALS_PER_ALERT,
    };
  });

export const proposeSharedSession = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; proposedFor: string; note: string }) => ({
    token: tokenSchema.parse(data.token),
    proposedFor: z.string().parse(data.proposedFor),
    note: z.string().max(MAX_NOTE_LENGTH).parse(data.note.trim()),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const invalid = validateProposal(data.proposedFor, data.note);
    if (invalid) return { ok: false, error: invalid };

    const { db, alert } = await loadAlert(data.token);
    if (!alert || isLinkExpired(alert.created_at))
      return { ok: false, error: "This link is no longer valid." };

    const { count } = await db
      .from("shared_sessions" as never)
      .select("id", { count: "exact", head: true })
      .eq("alert_id", alert.id);
    if ((count ?? 0) >= MAX_PROPOSALS_PER_ALERT)
      return { ok: false, error: "You've already proposed several sessions. Thanks for helping!" };

    const { data: contact } = await db
      .from("support_contacts" as never)
      .select("name")
      .eq("id", alert.contact_id)
      .maybeSingle();
    const { error } = await db.from("shared_sessions" as never).insert({
      alert_id: alert.id,
      patient_id: alert.patient_id,
      contact_id: alert.contact_id,
      contact_name: (contact as { name?: string } | null)?.name ?? "",
      proposed_for: new Date(data.proposedFor).toISOString(),
      note: data.note,
    } as never);
    if (error) return { ok: false, error: "Something went wrong. Please try again." };
    return { ok: true };
  });
