import { describe, it, expect } from "vitest";
import {
  buddyScore,
  rankBuddies,
  matchReasons,
  normalizeInviteCode,
  isInviteCodeFormat,
  formatInviteCode,
  toggleIn,
  type DirectoryProfile,
} from "@/lib/network";

const me = {
  rehab_area: "knee",
  languages: ["English", "Spanish"],
  availability: ["evenings", "weekends"],
};
const person = (id: string, over: Partial<DirectoryProfile>): DirectoryProfile => ({
  user_id: id,
  display_name: id,
  rehab_area: "other",
  languages: [],
  availability: [],
  discoverable: true,
  is_mentor: false,
  mentor_bio: "",
  ...over,
});

describe("buddy matching", () => {
  it("scores area +3, each language +2, each availability slot +1", () => {
    expect(
      buddyScore(me, {
        rehab_area: "knee",
        languages: ["Spanish"],
        availability: ["evenings", "weekends"],
      }),
    ).toBe(7);
    expect(buddyScore(me, { rehab_area: "hip", languages: [], availability: [] })).toBe(0);
  });

  it("ranks best matches first and skips excluded or hidden people", () => {
    const people = [
      person("low", { languages: ["English"] }),
      person("high", { rehab_area: "knee", languages: ["Spanish"] }),
      person("connected", { rehab_area: "knee", languages: ["English", "Spanish"] }),
      person("hidden", { rehab_area: "knee", discoverable: false }),
    ];
    const ranked = rankBuddies(me, people, new Set(["connected"]));
    expect(ranked.map((r) => r.profile.user_id)).toEqual(["high", "low"]);
  });

  it("limits the number of suggestions", () => {
    const many = Array.from({ length: 10 }, (_, i) => person(`p${i}`, {}));
    expect(rankBuddies(me, many, new Set(), 6)).toHaveLength(6);
  });

  it("explains why someone is suggested", () => {
    const reasons = matchReasons(me, {
      rehab_area: "knee",
      languages: ["Spanish"],
      availability: ["evenings"],
    });
    expect(reasons).toEqual(["Also knee rehab", "Speaks Spanish", "Free evenings"]);
  });
});

describe("invite codes", () => {
  it("accepts codes typed in lowercase or with a dash", () => {
    expect(normalizeInviteCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(isInviteCodeFormat("ABCDEFGH")).toBe(true);
  });

  it("rejects look-alike characters and wrong lengths", () => {
    expect(isInviteCodeFormat("ABCDEFG0")).toBe(false);
    expect(isInviteCodeFormat("ABCDEFGI")).toBe(false);
    expect(isInviteCodeFormat("ABCDEFG")).toBe(false);
  });

  it("formats codes to read out loud", () => {
    expect(formatInviteCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("toggles items in a list", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});
