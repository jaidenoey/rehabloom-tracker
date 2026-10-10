// Pure logic for "Your people" (support network). No database access, so it can be unit-tested.

export const REHAB_AREAS = [
  { value: "knee", label: "Knee" },
  { value: "hip", label: "Hip" },
  { value: "shoulder", label: "Shoulder" },
  { value: "back", label: "Back / spine" },
  { value: "ankle_foot", label: "Ankle / foot" },
  { value: "hand_wrist", label: "Hand / wrist" },
  { value: "neck", label: "Neck" },
  { value: "neurological", label: "Neurological" },
  { value: "post_surgery", label: "Post-surgery" },
  { value: "other", label: "Other" },
] as const;

export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "Portuguese",
  "Chinese",
  "Arabic",
  "Hindi",
  "Other",
] as const;

export const AVAILABILITY = [
  { value: "mornings", label: "Mornings" },
  { value: "afternoons", label: "Afternoons" },
  { value: "evenings", label: "Evenings" },
  { value: "weekends", label: "Weekends" },
] as const;

export const KIND_LABEL: Record<string, string> = {
  family: "Family",
  friend: "Friend",
  buddy: "Rehab buddy",
  mentor: "Mentor",
};

export const QUICK_ENCOURAGEMENTS = [
  "You've got this! 💪",
  "Proud of you 🌱",
  "Want to do a session together?",
] as const;

export const MAX_ENCOURAGEMENT_LENGTH = 280;
export const MAX_REQUEST_MESSAGE_LENGTH = 200;
export const MAX_BIO_LENGTH = 300;

export type DirectoryProfile = {
  user_id: string;
  display_name: string;
  rehab_area: string;
  languages: string[];
  availability: string[];
  discoverable: boolean;
  is_mentor: boolean;
  mentor_bio: string;
};

type Matchable = { rehab_area: string; languages: string[]; availability: string[] };

export function areaLabel(value: string) {
  return REHAB_AREAS.find((a) => a.value === value)?.label ?? "Other";
}

export function availabilityLabel(value: string) {
  return AVAILABILITY.find((a) => a.value === value)?.label ?? value;
}

const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;

/** Same rehab area +3, each shared language +2, each overlapping availability slot +1. */
export function buddyScore(me: Matchable, other: Matchable) {
  return (
    (me.rehab_area === other.rehab_area ? 3 : 0) +
    overlap(me.languages, other.languages) * 2 +
    overlap(me.availability, other.availability)
  );
}

/** Why we suggest this person, in plain words (shown on the card). */
export function matchReasons(me: Matchable, other: Matchable) {
  const reasons: string[] = [];
  if (me.rehab_area === other.rehab_area && other.rehab_area !== "other")
    reasons.push(`Also ${areaLabel(other.rehab_area).toLowerCase()} rehab`);
  const langs = other.languages.filter((l) => me.languages.includes(l));
  if (langs.length) reasons.push(`Speaks ${langs.join(", ")}`);
  const slots = other.availability.filter((s) => me.availability.includes(s));
  if (slots.length)
    reasons.push(`Free ${slots.map((s) => availabilityLabel(s).toLowerCase()).join(", ")}`);
  return reasons;
}

/** Top buddy suggestions: discoverable people not excluded (already connected, pending…), best match first. */
export function rankBuddies(
  me: Matchable,
  people: DirectoryProfile[],
  excluded: Set<string>,
  limit = 6,
) {
  return people
    .filter((p) => p.discoverable && !excluded.has(p.user_id))
    .map((p) => ({ profile: p, score: buddyScore(me, p) }))
    .sort(
      (a, b) => b.score - a.score || a.profile.display_name.localeCompare(b.profile.display_name),
    )
    .slice(0, limit);
}

/** Invite codes are 8 chars without look-alikes (0/O/1/I). People may type them in lowercase or with dashes. */
export function normalizeInviteCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isInviteCodeFormat(code: string) {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code);
}

/** Shown as XXXX-XXXX so it's easy to read out loud. */
export function formatInviteCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function toggleIn<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
