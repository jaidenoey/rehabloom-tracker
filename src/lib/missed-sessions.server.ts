// Daily job: find patients who missed their sessions and alert their support network.
// Server-only (uses the service-role client, which bypasses RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dayKey } from "@/lib/rehab";
import {
  buildAlertMessage,
  displayName,
  missedStreak,
  normalizePhone,
  shouldAlert,
} from "@/lib/alerts";
import { sendSms } from "@/lib/notify.server";

/**
 * Contract with Ines's network feature. Her `support_contacts` table must expose at least:
 *   user_id (patient), id, name, phone, notify_on_missed
 * Keep these names in sync with her migration.
 */
type SupportContact = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  notify_on_missed: boolean;
};

type Row = Record<string, unknown>;
const groupBy = <T extends Row>(rows: T[], key: keyof T) => {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r[key]);
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
};

export type JobSummary = {
  patientsChecked: number;
  patientsAlerted: number;
  messages: number;
  skippedDuplicates: number;
};

export async function runMissedSessionJob(appUrl: string, today = new Date()): Promise<JobSummary> {
  // The new tables are not in the generated types until Lovable regenerates them.
  const db = supabaseAdmin as unknown as SupabaseClient;
  const since = new Date(today);
  since.setDate(since.getDate() - 15);
  const sinceKey = dayKey(since);

  const [ex, comp, chk, contacts] = await Promise.all([
    db.from("exercises").select("user_id, frequency, occurrences, days, created_at"),
    db.from("completions").select("user_id, day, status").gte("day", sinceKey),
    db.from("checkins").select("user_id, day, status").gte("day", sinceKey),
    db
      .from("support_contacts")
      .select("id, user_id, name, phone, notify_on_missed")
      .eq("notify_on_missed", true),
  ]);
  for (const r of [ex, comp, chk, contacts]) if (r.error) throw new Error(r.error.message);

  const exercisesBy = groupBy(ex.data ?? [], "user_id");
  const completionsBy = groupBy(comp.data ?? [], "user_id");
  const checkinsBy = groupBy(chk.data ?? [], "user_id");
  const contactsBy = groupBy((contacts.data ?? []) as SupportContact[], "user_id");

  const summary: JobSummary = {
    patientsChecked: 0,
    patientsAlerted: 0,
    messages: 0,
    skippedDuplicates: 0,
  };

  for (const [patientId, patientContacts] of contactsBy) {
    summary.patientsChecked++;
    const streak = missedStreak(
      (exercisesBy.get(patientId) ?? []) as never,
      (completionsBy.get(patientId) ?? []) as never,
      (checkinsBy.get(patientId) ?? []) as never,
      today,
    );
    if (!shouldAlert(streak)) continue;

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(patientId);
    const meta = userData.user?.user_metadata as { full_name?: string; name?: string } | undefined;
    const patientName = displayName(meta?.full_name ?? meta?.name, userData.user?.email);
    let alerted = false;

    for (const contact of patientContacts) {
      // Reserve the alert first: the unique (patient, contact, streak_start) stops duplicates
      // if the job runs twice, and gives us the token for the contact's link.
      const phone = normalizePhone(contact.phone ?? "");
      const { data: alert, error } = await db
        .from("alert_events")
        .insert({
          patient_id: patientId,
          contact_id: contact.id,
          streak_start: streak.startDay,
          missed_days: streak.days,
          delivery_status: phone ? "simulated" : "no_phone",
        })
        .select("id, token")
        .single();
      if (error) {
        if (error.code === "23505") summary.skippedDuplicates++;
        else console.error("[alerts] could not record alert", error.message);
        continue;
      }
      if (!phone) continue;

      const body = buildAlertMessage({
        patientName,
        contactName: displayName(contact.name, null),
        missedDays: streak.days,
        supportUrl: `${appUrl}/support/${alert.token}`,
      });
      const result = await sendSms(phone, body);
      await db
        .from("alert_events")
        .update({ delivery_status: result.status, error: result.error ?? "" })
        .eq("id", alert.id);
      summary.messages++;
      alerted = true;
    }
    if (alerted) summary.patientsAlerted++;
  }

  return summary;
}
