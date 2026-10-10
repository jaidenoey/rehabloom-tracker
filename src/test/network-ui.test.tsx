import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The cards talk to Supabase; for rendering we only need a harmless stub.
vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => Promise.resolve({ error: null }),
    update: () => query,
    delete: () => query,
  };
  return {
    supabase: { from: () => query, rpc: () => Promise.resolve({ data: null, error: null }) },
  };
});

import { PeopleCard } from "@/components/network/PeopleCard";
import { DiscoverCard } from "@/components/network/DiscoverCard";
import { InboxCard } from "@/components/network/InboxCard";
import { InviteCard } from "@/components/network/InviteCard";
import { ProfileCard } from "@/components/network/ProfileCard";
import { emptyProfile } from "@/components/network/useNetwork";

const me = {
  ...emptyProfile("me"),
  display_name: "Ana",
  rehab_area: "knee",
  languages: ["Spanish"],
};

describe("Your people cards render", () => {
  it("people card shows contacts, people I support and blocks", () => {
    render(
      <PeopleCard
        contacts={[
          {
            id: "1",
            name: "Mom",
            phone: "",
            notify_on_missed: true,
            kind: "family",
            connected_user_id: null,
          },
          {
            id: "2",
            name: "Ben",
            phone: "",
            notify_on_missed: true,
            kind: "buddy",
            connected_user_id: "ben",
          },
        ]}
        supporting={[{ user_id: "dan", name: "Dan", kind: "mentor" }]}
        blocks={[{ blocked_id: "x", blocked_name: "Xavi" }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Mom")).toBeTruthy();
    expect(screen.getByText("Rehab buddy")).toBeTruthy();
    expect(screen.getByText("You're their mentor")).toBeTruthy();
    expect(screen.getByText(/No phone number saved/)).toBeTruthy();
    expect(screen.getByText("Blocked (1)")).toBeTruthy();
  });

  it("discover card ranks buddies and explains the match", () => {
    render(
      <DiscoverCard
        profile={me}
        excluded={new Set()}
        onChange={() => {}}
        directory={[
          {
            ...emptyProfile("b"),
            display_name: "Ben",
            rehab_area: "knee",
            languages: ["Spanish"],
            discoverable: true,
          },
          {
            ...emptyProfile("c"),
            display_name: "Cara",
            is_mentor: true,
            finished_therapy: true,
            mentor_bio: "ACL 2024",
          },
        ]}
      />,
    );
    expect(screen.getByText("Ben")).toBeTruthy();
    expect(screen.getByText(/Also knee rehab/)).toBeTruthy();
    expect(screen.getByText("Send buddy request")).toBeTruthy();
  });

  it("inbox shows encouragements and incoming requests", () => {
    render(
      <InboxCard
        userId="me"
        onChange={() => {}}
        encouragements={[
          {
            id: "e1",
            from_name: "Ben",
            message: "You got this",
            created_at: "2026-10-10T10:00:00Z",
            read_at: null,
          },
        ]}
        requests={[
          {
            id: "r1",
            from_user: "c",
            to_user: "me",
            from_name: "Cara",
            to_name: "Ana",
            kind: "buddy",
            message: "Hi!",
            created_at: "",
          },
        ]}
      />,
    );
    expect(screen.getByText(/You got this/)).toBeTruthy();
    expect(screen.getByText(/wants to be your rehab buddy/)).toBeTruthy();
    expect(screen.getByLabelText("New")).toBeTruthy();
  });

  it("invite card shows codes formatted and prefills a code from the link", () => {
    render(
      <InviteCard
        initialCode="ABCDEFGH"
        onChange={() => {}}
        invites={[
          {
            id: "i1",
            code: "WXYZ2345",
            relationship: "family",
            expires_at: "2026-10-17T00:00:00Z",
          },
        ]}
      />,
    );
    expect(screen.getByText("WXYZ-2345")).toBeTruthy();
    expect((screen.getByPlaceholderText("ABCD-EFGH") as HTMLInputElement).value).toBe("ABCDEFGH");
  });

  it("profile card only offers mentoring after finishing therapy", () => {
    const { rerender } = render(<ProfileCard profile={me} onSaved={() => {}} />);
    expect(screen.queryByText("Volunteer as a mentor")).toBeNull();
    rerender(<ProfileCard profile={{ ...me, finished_therapy: true }} onSaved={() => {}} />);
    expect(screen.getByText("Volunteer as a mentor")).toBeTruthy();
  });
});
