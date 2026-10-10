-- Missed-session alerts to the support network (owner: Antonio).
-- contact_id points at Ines's support_contacts table, but there is intentionally
-- no foreign key so both migrations can be applied in any order.

CREATE TABLE public.alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  streak_start date NOT NULL,
  missed_days integer NOT NULL CHECK (missed_days > 0),
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email')),
  delivery_status text NOT NULL CHECK (delivery_status IN ('sent', 'simulated', 'failed', 'no_phone')),
  error text NOT NULL DEFAULT '',
  -- Unguessable token used in the link the contact receives (they are not logged in).
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One alert per contact per missed streak.
  UNIQUE (patient_id, contact_id, streak_start)
);

CREATE TABLE public.shared_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.alert_events(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  proposed_for timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.alert_events TO authenticated;
GRANT SELECT, UPDATE ON public.shared_sessions TO authenticated;
GRANT ALL ON public.alert_events, public.shared_sessions TO service_role;

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_sessions ENABLE ROW LEVEL SECURITY;

-- Patients can see which alerts went out about them and accept/decline proposed sessions.
-- Contacts never query these tables directly: they go through server routes using the token.
CREATE POLICY "own alert events" ON public.alert_events FOR SELECT TO authenticated USING (auth.uid() = patient_id);
CREATE POLICY "own shared sessions read" ON public.shared_sessions FOR SELECT TO authenticated USING (auth.uid() = patient_id);
CREATE POLICY "own shared sessions answer" ON public.shared_sessions FOR UPDATE TO authenticated USING (auth.uid() = patient_id) WITH CHECK (auth.uid() = patient_id);
