// "Your profile": what others see when matching, plus the opt-in to become a mentor.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { AVAILABILITY, LANGUAGES, MAX_BIO_LENGTH, REHAB_AREAS, toggleIn } from "@/lib/network";
import { db, type MyProfile } from "./useNetwork";

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${on ? "bg-primary text-primary-foreground" : "bg-card"}`}
    >
      {label}
    </button>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full border transition ${on ? "bg-success" : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow transition-all ${on ? "left-7" : "left-0.5"}`}
      />
    </button>
  );
}

export function ProfileCard({ profile, onSaved }: { profile: MyProfile; onSaved: () => void }) {
  const [p, setP] = useState(profile);
  const [saving, setSaving] = useState(false);
  useEffect(() => setP(profile), [profile]);

  const set = <K extends keyof MyProfile>(key: K, value: MyProfile[K]) =>
    setP((prev) => ({ ...prev, [key]: value }));

  async function save() {
    if ((p.discoverable || p.is_mentor) && !p.display_name.trim()) {
      return void toast.error("Add a name so others know who you are.");
    }
    setSaving(true);
    const { error } = await db.from("network_profiles").upsert({
      user_id: p.user_id,
      display_name: p.display_name.trim(),
      rehab_area: p.rehab_area,
      languages: p.languages,
      availability: p.availability,
      discoverable: p.discoverable,
      finished_therapy: p.finished_therapy,
      is_mentor: p.finished_therapy && p.is_mentor,
      mentor_bio: p.mentor_bio.trim(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return void toast.error(error.message);
    toast.success("Profile saved");
    onSaved();
  }

  return (
    <section className="glass p-5" aria-labelledby="profile-h">
      <h2 id="profile-h" className="flex items-center gap-2 text-xl">
        <UserRound className="h-5 w-5" /> Your profile
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Others only ever see your name, rehab area, languages and availability — never your
        exercises, pain or contact details.
      </p>

      <label className="mt-3 block text-sm font-semibold">
        Name shown to others
        <input
          className="field mt-1"
          maxLength={60}
          value={p.display_name}
          onChange={(e) => set("display_name", e.target.value)}
          placeholder="e.g. Ana"
        />
      </label>

      <label className="mt-3 block text-sm font-semibold">
        Rehab area
        <select
          className="field mt-1"
          value={p.rehab_area}
          onChange={(e) => set("rehab_area", e.target.value)}
        >
          {REHAB_AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">Languages</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              label={l}
              on={p.languages.includes(l)}
              onClick={() => set("languages", toggleIn(p.languages, l))}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">When are you usually free?</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {AVAILABILITY.map((a) => (
            <Chip
              key={a.value}
              label={a.label}
              on={p.availability.includes(a.value)}
              onClick={() => set("availability", toggleIn(p.availability, a.value))}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold">
        <span>
          Let others find me as a rehab buddy
          <span className="block text-xs font-normal text-muted-foreground">
            Off by default. You can turn it off any time.
          </span>
        </span>
        <Switch
          on={p.discoverable}
          onChange={(v) => set("discoverable", v)}
          label="Let others find me as a rehab buddy"
        />
      </div>

      <div className="mt-4 rounded-2xl border bg-popover p-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={p.finished_therapy}
            onChange={(e) =>
              setP((prev) => ({
                ...prev,
                finished_therapy: e.target.checked,
                is_mentor: e.target.checked && prev.is_mentor,
              }))
            }
          />
          I've finished my physical therapy 🎓
        </label>
        {p.finished_therapy && (
          <>
            <div className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold">
              <span>
                Volunteer as a mentor
                <span className="block text-xs font-normal text-muted-foreground">
                  Share your experience with people who are just starting.
                </span>
              </span>
              <Switch
                on={p.is_mentor}
                onChange={(v) => set("is_mentor", v)}
                label="Volunteer as a mentor"
              />
            </div>
            {p.is_mentor && (
              <label className="mt-3 block text-sm font-semibold">
                A few words about your recovery
                <textarea
                  className="field mt-1"
                  rows={3}
                  maxLength={MAX_BIO_LENGTH}
                  value={p.mentor_bio}
                  onChange={(e) => set("mentor_bio", e.target.value)}
                  placeholder="Knee surgery in 2024 — happy to share what helped me stay motivated."
                />
              </label>
            )}
          </>
        )}
      </div>

      <button className="btn-aqua mt-4" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </section>
  );
}
