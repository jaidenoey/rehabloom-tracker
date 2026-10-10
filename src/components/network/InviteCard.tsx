// Invite family & friends with a private code, redeem someone's code, or add a contact without the app.
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Trash2, UserRoundPlus } from "lucide-react";
import { normalizePhone } from "@/lib/alerts";
import { formatInviteCode, isInviteCodeFormat, normalizeInviteCode } from "@/lib/network";
import { db, rpc, type InviteCode } from "./useNetwork";

export function InviteCard({
  invites,
  initialCode,
  onChange,
}: {
  invites: InviteCode[];
  initialCode: string;
  onChange: () => void;
}) {
  const [relationship, setRelationship] = useState("family");
  const [redeem, setRedeem] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ name: "", phone: "", kind: "family", notify: true });

  const linkFor = (code: string) => `${window.location.origin}/people?code=${code}`;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      const code = await rpc<string>("create_invite_code", { p_relationship: relationship });
      try {
        await navigator.clipboard.writeText(linkFor(code));
        toast.success(`Code ${formatInviteCode(code)} created — link copied!`);
      } catch {
        toast.success(`Code ${formatInviteCode(code)} created`);
      }
      onChange();
    });

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(linkFor(code));
      toast.success("Link copied");
    } catch {
      toast.info(linkFor(code));
    }
  }

  const revoke = (inv: InviteCode) =>
    run(async () => {
      const { error } = await db.from("invite_codes").delete().eq("id", inv.id);
      if (error) throw new Error(error.message);
      onChange();
    });

  function submitRedeem(e: FormEvent) {
    e.preventDefault();
    const code = normalizeInviteCode(redeem);
    if (!isInviteCodeFormat(code))
      return void toast.error("Codes have 8 letters and numbers, like ABCD-EFGH.");
    void run(async () => {
      const name = await rpc<string>("redeem_invite_code", { p_code: code });
      toast.success(`You're now part of ${name}'s support network 💚`);
      setRedeem("");
      onChange();
    });
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { error } = await db.from("support_contacts").insert({
        name: manual.name.trim(),
        phone: normalizePhone(manual.phone),
        kind: manual.kind,
        notify_on_missed: manual.notify,
      });
      if (error) throw new Error(error.message);
      toast.success(`${manual.name.trim()} added`);
      setManual({ name: "", phone: "", kind: "family", notify: true });
      onChange();
    });
  }

  return (
    <section className="glass p-5" aria-labelledby="invite-h">
      <h2 id="invite-h" className="flex items-center gap-2 text-xl">
        <UserRoundPlus className="h-5 w-5" /> Invite family & friends
      </h2>

      <p className="mt-1 text-sm text-muted-foreground">
        Share a private code. When they open the link (or type the code) in Rehabloom, they join
        your support network. Codes work once and expire after 7 days.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          className="field w-auto"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          aria-label="Relationship"
        >
          <option value="family">Family</option>
          <option value="friend">Friend</option>
        </select>
        <button className="btn-aqua" disabled={busy} onClick={create}>
          <KeyRound className="h-4 w-4" /> Create invite code
        </button>
      </div>
      {invites.length > 0 && (
        <ul className="mt-3 space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-popover p-3 text-sm"
            >
              <span>
                <b className="font-mono text-base tracking-widest">{formatInviteCode(inv.code)}</b>{" "}
                <span className="text-muted-foreground">
                  · {inv.relationship} · expires {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </span>
              <span className="flex gap-2">
                <button className="btn-soft text-sm" onClick={() => copy(inv.code)}>
                  <Copy className="h-4 w-4" /> Copy link
                </button>
                <button
                  className="btn-soft text-sm"
                  aria-label={`Delete code ${inv.code}`}
                  onClick={() => revoke(inv)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submitRedeem} className="mt-5">
        <label className="block text-sm font-semibold">
          Got a code from someone?
          <div className="mt-1 flex gap-2">
            <input
              className="field font-mono uppercase tracking-widest"
              value={redeem}
              onChange={(e) => setRedeem(e.target.value)}
              placeholder="ABCD-EFGH"
              maxLength={12}
            />
            <button className="btn-aqua shrink-0" disabled={busy || !redeem.trim()}>
              Join
            </button>
          </div>
        </label>
      </form>

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold">
          Add someone who doesn't use the app
        </summary>
        <form onSubmit={submitManual} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold">
              Name
              <input
                className="field mt-1"
                required
                maxLength={60}
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
              />
            </label>
            <label className="block text-sm font-semibold">
              Relationship
              <select
                className="field mt-1"
                value={manual.kind}
                onChange={(e) => setManual({ ...manual, kind: e.target.value })}
              >
                <option value="family">Family</option>
                <option value="friend">Friend</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Mobile number (with country code)
            <input
              className="field mt-1"
              type="tel"
              value={manual.phone}
              onChange={(e) => setManual({ ...manual, phone: e.target.value })}
              placeholder="+1 919 555 0100"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={manual.notify}
              onChange={(e) => setManual({ ...manual, notify: e.target.checked })}
            />
            Text this person if I miss my sessions for 2 days. Make sure they're happy to receive
            these messages.
          </label>
          <button className="btn-aqua" disabled={busy}>
            Add contact
          </button>
        </form>
      </details>
    </section>
  );
}
