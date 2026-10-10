// /support/:token — the page a support contact opens from the SMS.
// They can call or text the patient, or propose a rehab session together.
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CalendarHeart, MessageCircle, Phone } from "lucide-react";
import { Plant } from "@/components/rehab/Plant";
import { getSupportRequest, proposeSharedSession } from "@/lib/support.functions";
import { dayKey } from "@/lib/rehab";
import { MAX_NOTE_LENGTH } from "@/lib/alerts";

export const Route = createFileRoute("/support/$token")({
  head: () => ({
    meta: [
      { title: "Rehabloom — Support a friend" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ params }) => {
    try {
      return await getSupportRequest({ data: { token: params.token } });
    } catch {
      return { status: "not_found" as const };
    }
  },
  component: SupportPage,
});

const STATUS_LABEL: Record<string, string> = {
  proposed: "Waiting for their reply",
  accepted: "Accepted 🎉",
  declined: "Not this time",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 px-4 py-8">
      <p className="text-center text-sm font-bold tracking-wide text-muted-foreground">
        🌱 Rehabloom
      </p>
      {children}
    </main>
  );
}

function SupportPage() {
  const data = Route.useLoaderData();

  if (data.status !== "ok") {
    return (
      <Shell>
        <section className="glass p-6 text-center">
          <h1 className="text-2xl">
            {data.status === "expired" ? "This link has expired" : "Link not found"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {data.status === "expired"
              ? "Support links only work for a couple of weeks. If you'd still like to help, reach out to your friend directly."
              : "Please check that you opened the full link from the message."}
          </p>
        </section>
      </Shell>
    );
  }

  const { patientName, contactName, missedDays, patientPhone, sessions, canPropose } = data;

  return (
    <Shell>
      <section
        className="glass flex flex-col items-center p-6 text-center"
        aria-labelledby="support-h"
      >
        <Plant stage={1} />
        <h1 id="support-h" className="mt-2 text-2xl">
          {patientName} could use a little support
        </h1>
        <p className="mt-2 text-muted-foreground">
          Hi {contactName}, {patientName} hasn't logged their rehab sessions for {missedDays} days.
          A friendly call or doing a session together can make a big difference.
        </p>

        {patientPhone ? (
          <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
            <a className="btn-aqua btn-leaf" href={`tel:${patientPhone}`}>
              <Phone className="h-4 w-4" /> Call {patientName}
            </a>
            <a className="btn-soft" href={`sms:${patientPhone}`}>
              <MessageCircle className="h-4 w-4" /> Send a message
            </a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {patientName} hasn't shared a phone number here — you can propose a session below
            instead.
          </p>
        )}
      </section>

      <ProposeSession patientName={patientName} canPropose={canPropose} />

      {sessions.length > 0 && (
        <section className="glass p-5" aria-labelledby="proposed-h">
          <h2 id="proposed-h" className="text-xl">
            Sessions you proposed
          </h2>
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-2xl border bg-popover p-3 text-sm">
                <p className="font-semibold">
                  {new Date(s.proposedFor).toLocaleString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                {s.note && <p className="text-muted-foreground">“{s.note}”</p>}
                <p className="mt-1 text-xs font-bold uppercase text-muted-foreground">
                  {STATUS_LABEL[s.status] ?? s.status}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground">
        You're getting this because {patientName} added you to their support network on Rehabloom.
      </p>
    </Shell>
  );
}

function ProposeSession({ patientName, canPropose }: { patientName: string; canPropose: boolean }) {
  const { token } = Route.useParams();
  const router = useRouter();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [date, setDate] = useState(dayKey(tomorrow));
  const [time, setTime] = useState("18:00");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    // The browser knows the contact's time zone, so build the exact moment here.
    const proposedFor = new Date(`${date}T${time}`).toISOString();
    const res = await proposeSharedSession({ data: { token, proposedFor, note } }).catch(() => ({
      ok: false as const,
      error: "Something went wrong. Please try again.",
    }));
    setSending(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error });
    setNote("");
    setMessage({ ok: true, text: `Sent! ${patientName} will see your invite in Rehabloom.` });
    await router.invalidate();
  }

  return (
    <section className="glass p-5" aria-labelledby="propose-h">
      <h2 id="propose-h" className="flex items-center gap-2 text-xl">
        <CalendarHeart className="h-5 w-5" /> Do a session together
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a time to do {patientName}'s exercises with them — in person or on a video call.
      </p>
      {canPropose ? (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold">
              Date
              <input
                type="date"
                required
                className="field mt-1"
                value={date}
                min={dayKey(new Date())}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Time
              <input
                type="time"
                required
                className="field mt-1"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Note (optional)
            <textarea
              className="field mt-1"
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="I can come over after work!"
            />
          </label>
          <button type="submit" className="btn-aqua w-full" disabled={sending}>
            {sending ? "Sending…" : "Propose session"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          You've already proposed a few sessions — thanks for being there!
        </p>
      )}
      {message && (
        <p
          role="status"
          className={`mt-3 text-sm font-semibold ${message.ok ? "text-success" : "text-destructive"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
