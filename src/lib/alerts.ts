// Pure logic for missed-session alerts to the support network.
// No database or network access here so it can be unit-tested.
import { dayKey, scheduledCount } from "@/lib/rehab";

/** Consecutive scheduled days without activity that trigger an alert. */
export const ALERT_AFTER_MISSED_DAYS = 2;
/** How far back we look when counting a missed streak. */
const LOOKBACK_DAYS = 14;

type Exercise = { frequency: string; occurrences: number; days: number[]; created_at: string };
type Completion = { day: string; status: string };
type Checkin = { day: string; status: string };

export type MissedStreak = {
  /** Number of consecutive scheduled days missed, ending yesterday. */
  days: number;
  /** First missed day of the streak (YYYY-MM-DD), used to avoid alerting twice for the same streak. */
  startDay: string | null;
};

/**
 * Counts consecutive scheduled days the patient missed, walking back from yesterday
 * (today is not over yet). A day breaks the streak if the patient completed at least
 * one exercise OR honestly logged a rest / unable check-in — being honest is engagement.
 * Days with nothing scheduled are ignored (they neither count nor break the streak).
 */
export function missedStreak(
  exercises: Exercise[],
  completions: Completion[],
  checkins: Checkin[],
  today = new Date(),
): MissedStreak {
  const completedDays = new Set(completions.filter((c) => c.status === "complete").map((c) => c.day));
  const honestDays = new Set(checkins.filter((c) => c.status === "rest" || c.status === "unable").map((c) => c.day));

  let days = 0;
  let startDay: string | null = null;

  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);

    const active = exercises.filter((ex) => dayKey(new Date(ex.created_at)) <= key);
    const scheduled = active.reduce((n, ex) => n + scheduledCount(ex, d), 0);
    if (scheduled === 0) continue;

    if (completedDays.has(key) || honestDays.has(key)) break;
    days++;
    startDay = key;
  }

  return { days, startDay };
}

export function shouldAlert(streak: MissedStreak, threshold = ALERT_AFTER_MISSED_DAYS) {
  return streak.days >= threshold && streak.startDay !== null;
}

/** Name to show contacts: first name if we have it, otherwise the email's local part. */
export function displayName(fullName: string | undefined | null, email: string | undefined | null) {
  const first = fullName?.trim().split(/\s+/)[0];
  if (first) return first;
  return email?.split("@")[0] ?? "Your friend";
}

/**
 * The text a support contact receives. It deliberately avoids medical details
 * (pain, diagnosis, exercises) — it only says they haven't logged in.
 */
export function buildAlertMessage(opts: {
  patientName: string;
  contactName: string;
  missedDays: number;
  supportUrl: string;
}) {
  const { patientName, contactName, missedDays, supportUrl } = opts;
  return (
    `Hi ${contactName}, ${patientName} hasn't logged their rehab sessions on Rehabloom for ${missedDays} days. ` +
    `A little support goes a long way 🌱\n\n` +
    `Call them or set up a session together: ${supportUrl}`
  );
}

/** Keep only digits and a leading +, so it works in tel: links and SMS providers. */
export function normalizePhone(raw: string) {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}
