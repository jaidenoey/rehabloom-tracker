// /people — "Your people": the patient's support network.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/rehab/AuthCard";
import { useNetwork } from "@/components/network/useNetwork";
import { ProfileCard } from "@/components/network/ProfileCard";
import { InboxCard } from "@/components/network/InboxCard";
import { PeopleCard } from "@/components/network/PeopleCard";
import { DiscoverCard } from "@/components/network/DiscoverCard";
import { InviteCard } from "@/components/network/InviteCard";

export const Route = createFileRoute("/people")({
  validateSearch: (search: Record<string, unknown>): { code?: string } => {
    const code = search["code"];
    return typeof code === "string" ? { code: code.slice(0, 12) } : {};
  },
  head: () => ({ meta: [{ title: "Your people — Rehabloom" }] }),
  component: PeoplePage,
});

function PeoplePage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const { code } = Route.useSearch();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  if (!user) {
    return (
      <div>
        {code && (
          <p className="mx-auto mt-6 max-w-md px-4 text-center text-sm font-semibold">
            Sign in or create an account to join with your invite code.
          </p>
        )}
        <AuthCard />
      </div>
    );
  }
  return <People key={user.id} userId={user.id} initialCode={code ?? ""} />;
}

function People({ userId, initialCode }: { userId: string; initialCode: string }) {
  const n = useNetwork(userId);

  // Don't suggest people we're already connected with or have a pending request with.
  const excluded = useMemo(() => {
    const ids = new Set<string>();
    n.contacts.forEach((c) => c.connected_user_id && ids.add(c.connected_user_id));
    n.supporting.forEach((s) => ids.add(s.user_id));
    n.requests.forEach((r) => {
      ids.add(r.from_user);
      ids.add(r.to_user);
    });
    return ids;
  }, [n.contacts, n.supporting, n.requests]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/" className="btn-soft" aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div>
          <h1 className="text-3xl">Your people</h1>
          <p className="text-sm text-muted-foreground">Recovery is easier together 🌱</p>
        </div>
      </header>

      {n.loading ? (
        <p className="p-10 text-center text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <InboxCard
              key={n.encouragements.map((e) => e.id).join()}
              userId={userId}
              requests={n.requests}
              encouragements={n.encouragements}
              onChange={n.reload}
            />
            <PeopleCard
              contacts={n.contacts}
              supporting={n.supporting}
              blocks={n.blocks}
              onChange={n.reload}
            />
            <InviteCard invites={n.invites} initialCode={initialCode} onChange={n.reload} />
          </div>
          <div className="space-y-4">
            <DiscoverCard
              profile={n.profile}
              directory={n.directory}
              excluded={excluded}
              onChange={n.reload}
            />
            <ProfileCard profile={n.profile} onSaved={n.reload} />
          </div>
        </div>
      )}
    </div>
  );
}
