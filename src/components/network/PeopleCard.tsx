// "Your people": who supports me (with the alert toggle) and who I support.
import { useState } from "react";
import { toast } from "sonner";
import { Ban, HeartHandshake, MessageCircleHeart, UserMinus } from "lucide-react";
import { KIND_LABEL, MAX_ENCOURAGEMENT_LENGTH, QUICK_ENCOURAGEMENTS } from "@/lib/network";
import { db, rpc, type Block, type Contact, type Supported } from "./useNetwork";

function Encourage({ to, name, onDone }: { to: string; name: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send(message: string) {
    setSending(true);
    try {
      await rpc("send_encouragement", { p_to: to, p_message: message });
      toast.success(`Sent to ${name} 💌`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-2xl border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_ENCOURAGEMENTS.map((q) => (
          <button key={q} className="btn-soft text-sm" disabled={sending} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send(text);
        }}
      >
        <input
          className="field"
          maxLength={MAX_ENCOURAGEMENT_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or write your own…"
          aria-label={`Message to ${name}`}
        />
        <button className="btn-aqua shrink-0" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export function PeopleCard({
  contacts,
  supporting,
  blocks,
  onChange,
}: {
  contacts: Contact[];
  supporting: Supported[];
  blocks: Block[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  async function toggleNotify(c: Contact) {
    const { error } = await db
      .from("support_contacts")
      .update({ notify_on_missed: !c.notify_on_missed })
      .eq("id", c.id);
    if (error) return void toast.error(error.message);
    onChange();
  }

  async function remove(c: Contact) {
    if (!confirm(`Remove ${c.name} from your people? They won't get alerts about you anymore.`))
      return;
    try {
      if (c.connected_user_id) await rpc("disconnect_person", { p_other: c.connected_user_id });
      else {
        const { error } = await db.from("support_contacts").delete().eq("id", c.id);
        if (error) throw new Error(error.message);
      }
      toast.success(`${c.name} removed`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function disconnect(userId: string, name: string) {
    if (!confirm(`Stop supporting ${name}? You'll no longer get alerts about them.`)) return;
    try {
      await rpc("disconnect_person", { p_other: userId });
      toast.success(`Disconnected from ${name}`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function block(userId: string, name: string) {
    if (
      !confirm(
        `Block ${name}? You'll be disconnected and they won't be able to find you or contact you here.`,
      )
    )
      return;
    try {
      await rpc("block_person", { p_other: userId });
      toast.success(`${name} blocked`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function unblock(b: Block) {
    const { error } = await db.from("blocks").delete().eq("blocked_id", b.blocked_id);
    if (error) return void toast.error(error.message);
    toast.success(`${b.blocked_name || "Person"} unblocked`);
    onChange();
  }

  return (
    <section className="glass p-5" aria-labelledby="people-h">
      <h2 id="people-h" className="flex items-center gap-2 text-xl">
        <HeartHandshake className="h-5 w-5" /> Your people
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        People with alerts on get a text if you miss your sessions for 2 days, so they can call you
        or plan a session together.
      </p>

      {contacts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          No one yet — invite family and friends below, or find a rehab buddy.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-2xl border bg-popover p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {c.name}{" "}
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                    {KIND_LABEL[c.kind] ?? c.kind}
                  </span>
                </p>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={c.notify_on_missed}
                    onChange={() => toggleNotify(c)}
                  />
                  Alert them if I miss sessions
                </label>
              </div>
              {!c.connected_user_id && !c.phone && c.notify_on_missed && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No phone number saved, so they can't be texted yet.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {c.connected_user_id && (
                  <button
                    className="btn-soft text-sm"
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                  >
                    <MessageCircleHeart className="h-4 w-4" /> Send encouragement
                  </button>
                )}
                <button className="btn-soft text-sm" onClick={() => remove(c)}>
                  <UserMinus className="h-4 w-4" /> {c.connected_user_id ? "Disconnect" : "Remove"}
                </button>
                {c.connected_user_id && (
                  <button
                    className="btn-soft text-sm"
                    onClick={() => block(c.connected_user_id!, c.name)}
                  >
                    <Ban className="h-4 w-4" /> Block
                  </button>
                )}
              </div>
              {open === c.id && c.connected_user_id && (
                <Encourage to={c.connected_user_id} name={c.name} onDone={() => setOpen(null)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {supporting.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-bold uppercase text-muted-foreground">
            People you support
          </h3>
          <ul className="mt-2 space-y-2">
            {supporting.map((s) => {
              const key = `s-${s.user_id}`;
              return (
                <li key={key} className="rounded-2xl border bg-popover p-3 text-sm">
                  <p className="font-semibold">
                    {s.name}{" "}
                    <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                      {s.kind === "mentor" ? "You're their mentor" : KIND_LABEL[s.kind]}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="btn-soft text-sm"
                      onClick={() => setOpen(open === key ? null : key)}
                    >
                      <MessageCircleHeart className="h-4 w-4" /> Send encouragement
                    </button>
                    <button
                      className="btn-soft text-sm"
                      onClick={() => disconnect(s.user_id, s.name)}
                    >
                      <UserMinus className="h-4 w-4" /> Disconnect
                    </button>
                    <button className="btn-soft text-sm" onClick={() => block(s.user_id, s.name)}>
                      <Ban className="h-4 w-4" /> Block
                    </button>
                  </div>
                  {open === key && (
                    <Encourage to={s.user_id} name={s.name} onDone={() => setOpen(null)} />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {blocks.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-semibold text-muted-foreground">
            Blocked ({blocks.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {blocks.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between gap-2">
                <span>{b.blocked_name || "Someone"}</span>
                <button className="btn-soft text-sm" onClick={() => unblock(b)}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
