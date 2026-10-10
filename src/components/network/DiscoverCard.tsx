// Find a rehab buddy (matched by area, language, availability) or a volunteer mentor.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, UserPlus } from "lucide-react";
import {
  MAX_REQUEST_MESSAGE_LENGTH,
  REHAB_AREAS,
  areaLabel,
  availabilityLabel,
  matchReasons,
  rankBuddies,
  type DirectoryProfile,
} from "@/lib/network";
import { rpc, type MyProfile } from "./useNetwork";

function RequestButton({
  person,
  kind,
  onSent,
}: {
  person: DirectoryProfile;
  kind: "buddy" | "mentor";
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      await rpc("send_connection_request", {
        p_to: person.user_id,
        p_kind: kind,
        p_message: message,
      });
      toast.success(`Request sent to ${person.display_name}`);
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-soft mt-2 text-sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />{" "}
        {kind === "buddy" ? "Send buddy request" : "Ask for mentorship"}
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <input
        className="field"
        maxLength={MAX_REQUEST_MESSAGE_LENGTH}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          kind === "buddy" ? "Say hi (optional)" : "What would you like help with? (optional)"
        }
        aria-label="Message"
      />
      <div className="flex gap-2">
        <button className="btn-aqua" disabled={sending} onClick={send}>
          {sending ? "Sending…" : "Send"}
        </button>
        <button className="btn-soft" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Tags({ person }: { person: DirectoryProfile }) {
  const tags = [
    areaLabel(person.rehab_area),
    ...person.languages,
    ...person.availability.map(availabilityLabel),
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
          {t}
        </span>
      ))}
    </div>
  );
}

export function DiscoverCard({
  profile,
  directory,
  excluded,
  onChange,
}: {
  profile: MyProfile;
  directory: DirectoryProfile[];
  excluded: Set<string>;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<"buddies" | "mentors">("buddies");
  const [area, setArea] = useState("all");
  const buddies = useMemo(
    () => rankBuddies(profile, directory, excluded),
    [profile, directory, excluded],
  );
  const mentors = directory.filter(
    (p) => p.is_mentor && !excluded.has(p.user_id) && (area === "all" || p.rehab_area === area),
  );
  const needsName = !profile.display_name;

  return (
    <section className="glass p-5" aria-labelledby="discover-h">
      <h2 id="discover-h" className="flex items-center gap-2 text-xl">
        <Sparkles className="h-5 w-5" /> Find support
      </h2>
      <div className="mt-3 flex gap-2" role="tablist">
        {(["buddies", "mentors"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tab === t ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {t === "buddies" ? "Rehab buddies" : "Mentors"}
          </button>
        ))}
      </div>

      {needsName && (
        <p className="mt-3 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
          Add your name, rehab area and availability in “Your profile” to get better matches and
          send requests.
        </p>
      )}

      {tab === "buddies" ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            People going through rehab too, matched by rehab area, language and when you're free.
          </p>
          {buddies.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No suggestions right now — check back soon as more people join.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {buddies.map(({ profile: p }) => {
                const reasons = matchReasons(profile, p);
                return (
                  <li key={p.user_id} className="rounded-2xl border bg-popover p-3 text-sm">
                    <p className="font-semibold">{p.display_name}</p>
                    <Tags person={p} />
                    {reasons.length > 0 && (
                      <p className="mt-1 text-xs text-success">✓ {reasons.join(" · ")}</p>
                    )}
                    {!needsName && <RequestButton person={p} kind="buddy" onSent={onChange} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Volunteers who have finished their physical therapy. Mentors share their experience —
            they don't give medical advice.
          </p>
          <label className="mt-3 block text-sm font-semibold">
            Rehab area
            <select className="field mt-1" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="all">All areas</option>
              {REHAB_AREAS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {mentors.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No mentors available for this area yet.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {mentors.map((p) => (
                <li key={p.user_id} className="rounded-2xl border bg-popover p-3 text-sm">
                  <p className="font-semibold">{p.display_name} 🎓</p>
                  <Tags person={p} />
                  {p.mentor_bio && <p className="mt-1 text-muted-foreground">“{p.mentor_bio}”</p>}
                  {!needsName && <RequestButton person={p} kind="mentor" onSent={onChange} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
