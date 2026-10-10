// Patient-side panel for the support-network alerts:
// - the phone number contacts can call when they get an alert
// - session invites proposed by contacts, to accept or decline
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { CalendarHeart, Check, Users, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/alerts";

// The new tables are not in the generated types until Lovable regenerates them.
const db = supabase as unknown as SupabaseClient;

type Session = {
  id: string;
  contact_name: string;
  proposed_for: string;
  note: string;
  status: string;
};

export function SupportAlertsPanel({ userId }: { userId: string }) {
  const [phone, setPhone] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [profile, list] = await Promise.all([
      db.from("support_profiles").select("phone").eq("user_id", userId).maybeSingle(),
      db
        .from("shared_sessions")
        .select("id, contact_name, proposed_for, note, status")
        .neq("status", "declined")
        .gte("proposed_for", since)
        .order("proposed_for"),
    ]);
    setPhone((profile.data as { phone?: string } | null)?.phone ?? "");
    setSessions((list.data ?? []) as Session[]);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePhone() {
    const clean = normalizePhone(phone);
    const { error } = await db
      .from("support_profiles")
      .upsert({ user_id: userId, phone: clean, updated_at: new Date().toISOString() });
    if (error) return void toast.error(error.message);
    setPhone(clean);
    toast.success("Phone saved");
  }

  async function answer(id: string, status: "accepted" | "declined") {
    const { error } = await db.from("shared_sessions").update({ status }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success(
      status === "accepted" ? "Session accepted — enjoy it together!" : "Invite declined",
    );
    void load();
  }

  return (
    <section className="glass p-5" aria-labelledby="support-alerts-h">
      <h2 id="support-alerts-h" className="flex items-center gap-2 text-xl">
        <CalendarHeart className="h-5 w-5" /> Support network
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        If you miss your sessions for a couple of days, the people in your support network get a
        message so they can call you or do a session with you.
      </p>
      <Link to="/people" className="btn-aqua mt-3">
        <Users className="h-4 w-4" /> Your people
      </Link>

      <label className="mt-3 block text-sm font-semibold">
        Your phone (so they can call you)
        <div className="mt-1 flex gap-2">
          <input
            type="tel"
            className="field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 919 555 0100"
          />
          <button className="btn-aqua shrink-0" onClick={savePhone}>
            Save
          </button>
        </div>
      </label>

      <h3 className="mt-4 text-sm font-bold uppercase text-muted-foreground">Session invites</h3>
      {sessions.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No invites right now.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-2xl border bg-popover p-3 text-sm">
              <p className="font-semibold">
                {s.contact_name || "Someone"} ·{" "}
                {new Date(s.proposed_for).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {s.note && <p className="text-muted-foreground">“{s.note}”</p>}
              {s.status === "proposed" ? (
                <div className="mt-2 flex gap-2">
                  <button className="btn-aqua btn-leaf" onClick={() => answer(s.id, "accepted")}>
                    <Check className="h-4 w-4" /> Accept
                  </button>
                  <button className="btn-soft" onClick={() => answer(s.id, "declined")}>
                    <X className="h-4 w-4" /> Not now
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs font-bold uppercase text-success">Accepted 🎉</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
