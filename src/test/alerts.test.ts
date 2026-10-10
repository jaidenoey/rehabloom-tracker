import { describe, it, expect } from "vitest";
import { missedStreak, shouldAlert, buildAlertMessage, normalizePhone, displayName } from "@/lib/alerts";

// Saturday 10 Oct 2026, local noon to avoid timezone edge cases.
const today = new Date(2026, 9, 10, 12);
const daily = { frequency: "daily", occurrences: 1, days: [], created_at: "2026-09-01T00:00:00Z" };

describe("missed-session alerts", () => {
  it("counts consecutive missed days ending yesterday", () => {
    const s = missedStreak([daily], [{ day: "2026-10-07", status: "complete" }], [], today);
    expect(s).toEqual({ days: 2, startDay: "2026-10-08" });
    expect(shouldAlert(s)).toBe(true);
  });

  it("does not count today, which is not over yet", () => {
    const s = missedStreak([daily], [{ day: "2026-10-09", status: "complete" }], [], today);
    expect(s.days).toBe(0);
    expect(shouldAlert(s)).toBe(false);
  });

  it("skipped exercises still count as missed", () => {
    const s = missedStreak([daily], [{ day: "2026-10-09", status: "skip" }, { day: "2026-10-08", status: "complete" }], [], today);
    expect(s.days).toBe(1);
  });

  it("an honest rest or unable check-in breaks the streak", () => {
    const s = missedStreak([daily], [], [{ day: "2026-10-08", status: "rest" }], today);
    expect(s.days).toBe(1);
    expect(shouldAlert(s)).toBe(false);
  });

  it("ignores days with nothing scheduled", () => {
    // Weekly exercise on Mondays (1) and Thursdays (4): Thu 8 Oct and Mon 5 Oct missed, Thu 1 Oct done.
    const weekly = { frequency: "weekly", occurrences: 1, days: [1, 4], created_at: "2026-09-01T00:00:00Z" };
    const s = missedStreak([weekly], [{ day: "2026-10-01", status: "complete" }], [], today);
    expect(s).toEqual({ days: 2, startDay: "2026-10-05" });
  });

  it("does not count days before the exercise was prescribed", () => {
    const fresh = { ...daily, created_at: "2026-10-09T08:00:00" };
    expect(missedStreak([fresh], [], [], today).days).toBe(1);
  });

  it("message has no medical details and includes the support link", () => {
    const msg = buildAlertMessage({ patientName: "Ana", contactName: "Luis", missedDays: 3, supportUrl: "https://x.app/support/abc" });
    expect(msg).toContain("Ana");
    expect(msg).toContain("3 days");
    expect(msg).toContain("https://x.app/support/abc");
    expect(msg.toLowerCase()).not.toContain("pain");
  });

  it("normalizes phone numbers and names", () => {
    expect(normalizePhone(" +34 600-12 34 56 ")).toBe("+34600123456");
    expect(normalizePhone("(919) 555-0100")).toBe("9195550100");
    expect(displayName("Ana María López", "a@b.com")).toBe("Ana");
    expect(displayName("", "ana.lopez@b.com")).toBe("ana.lopez");
  });
});
