// Encouragement messages received + pending buddy/mentor requests (incoming and outgoing).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Heart, Inbox, X } from "lucide-react";
import { KIND_LABEL } from "@/lib/network";
import { db, rpc, type ConnectionRequest, type Encouragement } from "./useNetwork";

export function InboxCard({
  userId,
  requests,
  encouragements,
  onChange,
}: {
  userId: string;
  requests: ConnectionRequest[];
  encouragements: Encouragement[];
  onChange: () => void;
}) {
  // Remember which messages were unread when the page opened, then mark them read.
  const [unread] = useState(
    () => new Set(encouragements.filter((e) => !e.read_at).map((e) => e.id)),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const incoming = requests.filter((r) => r.to_user === userId);
  const outgoing = requests.filter((r) => r.from_user === userId);

  useEffect(() => {
    if (unread.size === 0) return;
    void db
      .from("encouragements")
      .update({ read_at: new Date().toISOString() })
      .in("id", [...unread]);
  }, [unread]);

  async function act(id: string, fn: () => Promise<unknown>, success: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(success);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (encouragements.length === 0 && requests.length === 0) return null;

  return (
    <section className="glass p-5" aria-labelledby="inbox-h">
      <h2 id="inbox-h" className="flex items-center gap-2 text-xl">
        <Inbox className="h-5 w-5" /> For you
      </h2>

      {encouragements.length > 0 && (
        <ul className="mt-3 space-y-2">
          {encouragements.slice(0, 5).map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-2 rounded-2xl border bg-popover p-3 text-sm"
            >
              <Heart className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p>
                  <b>{e.from_name}</b>: {e.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString()}
                </p>
              </div>
              {unread.has(e.id) && (
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                  aria-label="New"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {incoming.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold uppercase text-muted-foreground">Requests</h3>
          <ul className="mt-2 space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className="rounded-2xl border bg-popover p-3 text-sm">
                <p>
                  <b>{r.from_name}</b>{" "}
                  {r.kind === "mentor"
                    ? "would like you as their mentor"
                    : "wants to be your rehab buddy"}
                </p>
                {r.message && <p className="text-muted-foreground">“{r.message}”</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    className="btn-aqua btn-leaf"
                    disabled={busy === r.id}
                    onClick={() =>
                      act(
                        r.id,
                        () => rpc("respond_connection_request", { p_id: r.id, p_accept: true }),
                        `You're now connected with ${r.from_name}!`,
                      )
                    }
                  >
                    <Check className="h-4 w-4" /> Accept
                  </button>
                  <button
                    className="btn-soft"
                    disabled={busy === r.id}
                    onClick={() =>
                      act(
                        r.id,
                        () => rpc("respond_connection_request", { p_id: r.id, p_accept: false }),
                        "Request declined",
                      )
                    }
                  >
                    <X className="h-4 w-4" /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold uppercase text-muted-foreground">
            Waiting for a reply
          </h3>
          <ul className="mt-2 space-y-2">
            {outgoing.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-2xl border bg-popover p-3 text-sm"
              >
                <span>
                  {KIND_LABEL[r.kind]} request to <b>{r.to_name}</b>
                </span>
                <button
                  className="btn-soft"
                  disabled={busy === r.id}
                  onClick={() =>
                    act(
                      r.id,
                      () => rpc("cancel_connection_request", { p_id: r.id }),
                      "Request cancelled",
                    )
                  }
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
