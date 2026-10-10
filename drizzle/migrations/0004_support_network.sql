-- "Your people": the patient's support network (family, friends, rehab buddies, mentors).
-- support_contacts is the table the missed-session alerts read (see 0003).
-- Anything that writes rows for ANOTHER user goes through SECURITY DEFINER functions
-- below, which check auth.uid() themselves. Clients only get direct access to their own rows.

CREATE TABLE public.network_profiles (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 60),
  rehab_area text NOT NULL DEFAULT 'other' CHECK (rehab_area IN
    ('knee','hip','shoulder','back','ankle_foot','hand_wrist','neck','neurological','post_surgery','other')),
  languages text[] NOT NULL DEFAULT '{}',
  availability text[] NOT NULL DEFAULT '{}',
  discoverable boolean NOT NULL DEFAULT false,
  finished_therapy boolean NOT NULL DEFAULT false,
  is_mentor boolean NOT NULL DEFAULT false,
  mentor_bio text NOT NULL DEFAULT '' CHECK (char_length(mentor_bio) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_mentor OR finished_therapy)
);

-- One row = "this person supports user_id and gets an SMS if user_id misses sessions".
CREATE TABLE public.support_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  phone text NOT NULL DEFAULT '',
  notify_on_missed boolean NOT NULL DEFAULT true,
  kind text NOT NULL CHECK (kind IN ('family','friend','buddy','mentor')),
  connected_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connected_user_id),
  CHECK (connected_user_id IS NULL OR connected_user_id <> user_id)
);

CREATE TABLE public.connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  from_name text NOT NULL DEFAULT '',
  to_name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('buddy','mentor')),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX connection_requests_one_pending
  ON public.connection_requests (LEAST(from_user, to_user), GREATEST(from_user, to_user), kind)
  WHERE status = 'pending';

CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  code text NOT NULL UNIQUE,
  relationship text NOT NULL CHECK (relationship IN ('family','friend')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.encouragements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  from_name text NOT NULL DEFAULT '',
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL DEFAULT auth.uid(),
  blocked_id uuid NOT NULL,
  blocked_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Direct table access: only your own rows, only the columns that are safe to change.
GRANT SELECT, INSERT, UPDATE ON public.network_profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.support_contacts TO authenticated;
GRANT UPDATE (name, phone, notify_on_missed) ON public.support_contacts TO authenticated;
GRANT SELECT ON public.connection_requests TO authenticated;
GRANT SELECT, DELETE ON public.invite_codes TO authenticated;
GRANT SELECT ON public.encouragements TO authenticated;
GRANT UPDATE (read_at) ON public.encouragements TO authenticated;
GRANT SELECT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.network_profiles, public.support_contacts, public.connection_requests,
  public.invite_codes, public.encouragements, public.blocks TO service_role;

ALTER TABLE public.network_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encouragements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own network profile" ON public.network_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own contacts read" ON public.support_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Clients may only add people WITHOUT an account. App users are linked through the functions below.
CREATE POLICY "own manual contacts add" ON public.support_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND connected_user_id IS NULL AND kind IN ('family','friend'));
CREATE POLICY "own contacts edit" ON public.support_contacts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own manual contacts remove" ON public.support_contacts FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND connected_user_id IS NULL);

CREATE POLICY "requests i am part of" ON public.connection_requests FOR SELECT TO authenticated
  USING (auth.uid() IN (from_user, to_user));
CREATE POLICY "own invite codes" ON public.invite_codes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own invite codes revoke" ON public.invite_codes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "encouragements i sent or got" ON public.encouragements FOR SELECT TO authenticated
  USING (auth.uid() IN (from_user, to_user));
CREATE POLICY "mark my encouragements read" ON public.encouragements FOR UPDATE TO authenticated
  USING (auth.uid() = to_user) WITH CHECK (auth.uid() = to_user);
CREATE POLICY "own blocks" ON public.blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "unblock" ON public.blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- ---------- helpers (internal) ----------

CREATE FUNCTION public.network_is_blocked(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a));
$$;

CREATE FUNCTION public.network_display_name(u uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF((SELECT display_name FROM network_profiles WHERE user_id = u), ''),
    NULLIF(split_part((SELECT email FROM auth.users WHERE id = u), '@', 1), ''),
    'Rehabloom friend');
$$;

-- ---------- functions the app calls ----------

-- People the current user may see: discoverable buddies and mentors, never blocked ones.
CREATE FUNCTION public.network_directory()
RETURNS TABLE (user_id uuid, display_name text, rehab_area text, languages text[], availability text[],
               discoverable boolean, is_mentor boolean, mentor_bio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.display_name, p.rehab_area, p.languages, p.availability, p.discoverable, p.is_mentor, p.mentor_bio
  FROM network_profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.user_id <> auth.uid()
    AND p.display_name <> ''
    AND (p.discoverable OR p.is_mentor)
    AND NOT network_is_blocked(auth.uid(), p.user_id)
  ORDER BY p.created_at DESC
  LIMIT 500;
$$;

-- People the current user supports (they appear in someone else's support_contacts).
CREATE FUNCTION public.people_i_support()
RETURNS TABLE (user_id uuid, name text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.user_id, network_display_name(c.user_id), c.kind
  FROM support_contacts c
  WHERE c.connected_user_id = auth.uid();
$$;

CREATE FUNCTION public.send_connection_request(p_to uuid, p_kind text, p_message text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  target network_profiles;
  new_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF p_to = me THEN RAISE EXCEPTION 'You can''t connect with yourself.'; END IF;
  IF p_kind NOT IN ('buddy','mentor') THEN RAISE EXCEPTION 'Unknown request type.'; END IF;
  IF COALESCE((SELECT display_name FROM network_profiles WHERE user_id = me), '') = '' THEN
    RAISE EXCEPTION 'Add your name in "Your profile" first, so they know who is asking.';
  END IF;
  SELECT * INTO target FROM network_profiles WHERE user_id = p_to;
  IF NOT FOUND OR network_is_blocked(me, p_to)
     OR (p_kind = 'buddy' AND NOT target.discoverable)
     OR (p_kind = 'mentor' AND NOT target.is_mentor) THEN
    RAISE EXCEPTION 'This person isn''t available right now.';
  END IF;
  IF EXISTS (SELECT 1 FROM support_contacts WHERE (user_id = me AND connected_user_id = p_to)
                                             OR (user_id = p_to AND connected_user_id = me)) THEN
    RAISE EXCEPTION 'You''re already connected.';
  END IF;
  BEGIN
    INSERT INTO connection_requests (from_user, to_user, from_name, to_name, kind, message)
    VALUES (me, p_to, network_display_name(me), network_display_name(p_to), p_kind, left(trim(COALESCE(p_message, '')), 200))
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'There is already a pending request between you.';
  END;
  RETURN new_id;
END $$;

CREATE FUNCTION public.respond_connection_request(p_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  r connection_requests;
BEGIN
  SELECT * INTO r FROM connection_requests WHERE id = p_id AND to_user = me AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request is no longer available.'; END IF;
  IF NOT p_accept THEN
    UPDATE connection_requests SET status = 'declined' WHERE id = p_id;
    RETURN;
  END IF;
  IF network_is_blocked(r.from_user, r.to_user) THEN RAISE EXCEPTION 'This request is no longer available.'; END IF;
  UPDATE connection_requests SET status = 'accepted' WHERE id = p_id;
  IF r.kind = 'buddy' THEN
    -- Buddies support each other: one row in each direction.
    INSERT INTO support_contacts (user_id, connected_user_id, name, kind)
    VALUES (r.from_user, r.to_user, network_display_name(r.to_user), 'buddy'),
           (r.to_user, r.from_user, network_display_name(r.from_user), 'buddy')
    ON CONFLICT (user_id, connected_user_id) DO NOTHING;
  ELSE
    -- Mentor request: the requester (mentee) is supported by the mentor.
    INSERT INTO support_contacts (user_id, connected_user_id, name, kind)
    VALUES (r.from_user, r.to_user, network_display_name(r.to_user), 'mentor')
    ON CONFLICT (user_id, connected_user_id) DO NOTHING;
  END IF;
END $$;

CREATE FUNCTION public.cancel_connection_request(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE connection_requests SET status = 'cancelled'
  WHERE id = p_id AND from_user = auth.uid() AND status = 'pending';
$$;

CREATE FUNCTION public.create_invite_code(p_relationship text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  bytes bytea;
  new_code text;
  i int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF p_relationship NOT IN ('family','friend') THEN RAISE EXCEPTION 'Unknown relationship.'; END IF;
  IF (SELECT count(*) FROM invite_codes WHERE user_id = me AND used_at IS NULL AND expires_at > now()) >= 10 THEN
    RAISE EXCEPTION 'You have 10 active codes already. Remove one first.';
  END IF;
  LOOP
    bytes := uuid_send(gen_random_uuid()); -- cryptographically random
    new_code := '';
    FOR i IN 0..7 LOOP
      new_code := new_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = new_code);
  END LOOP;
  INSERT INTO invite_codes (user_id, code, relationship) VALUES (me, new_code, p_relationship);
  RETURN new_code;
END $$;

-- Returns the inviter's name. The person redeeming becomes one of the inviter's support contacts.
CREATE FUNCTION public.redeem_invite_code(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  inv invite_codes;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  SELECT * INTO inv FROM invite_codes
  WHERE code = upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND OR network_is_blocked(me, inv.user_id) THEN RAISE EXCEPTION 'That code is invalid or has expired.'; END IF;
  IF inv.user_id = me THEN RAISE EXCEPTION 'That''s your own code — share it with someone you trust.'; END IF;
  INSERT INTO support_contacts (user_id, connected_user_id, name, kind)
  VALUES (inv.user_id, me, network_display_name(me), inv.relationship)
  ON CONFLICT (user_id, connected_user_id) DO NOTHING;
  UPDATE invite_codes SET used_at = now(), used_by = me WHERE id = inv.id;
  RETURN network_display_name(inv.user_id);
END $$;

-- Removes the connection in both directions.
CREATE FUNCTION public.disconnect_person(p_other uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM support_contacts
  WHERE (user_id = auth.uid() AND connected_user_id = p_other)
     OR (user_id = p_other AND connected_user_id = auth.uid());
$$;

CREATE FUNCTION public.block_person(p_other uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR p_other = me THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  DELETE FROM support_contacts
  WHERE (user_id = me AND connected_user_id = p_other) OR (user_id = p_other AND connected_user_id = me);
  UPDATE connection_requests SET status = 'declined'
  WHERE status = 'pending' AND ((from_user = me AND to_user = p_other) OR (from_user = p_other AND to_user = me));
  INSERT INTO blocks (blocker_id, blocked_id, blocked_name)
  VALUES (me, p_other, network_display_name(p_other)) ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION public.send_encouragement(p_to uuid, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  msg text := trim(COALESCE(p_message, ''));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF char_length(msg) NOT BETWEEN 1 AND 280 THEN RAISE EXCEPTION 'Messages can be 1 to 280 characters.'; END IF;
  IF network_is_blocked(me, p_to) OR NOT EXISTS (
    SELECT 1 FROM support_contacts WHERE (user_id = me AND connected_user_id = p_to)
                                     OR (user_id = p_to AND connected_user_id = me)) THEN
    RAISE EXCEPTION 'You can only encourage people you''re connected with.';
  END IF;
  IF (SELECT count(*) FROM encouragements
      WHERE from_user = me AND to_user = p_to AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'That''s a lot of love for one day — try again tomorrow!';
  END IF;
  INSERT INTO encouragements (from_user, to_user, from_name, message) VALUES (me, p_to, network_display_name(me), msg);
END $$;

REVOKE EXECUTE ON FUNCTION public.network_is_blocked(uuid, uuid), public.network_display_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.network_directory(), public.people_i_support(),
  public.send_connection_request(uuid, text, text), public.respond_connection_request(uuid, boolean),
  public.cancel_connection_request(uuid), public.create_invite_code(text), public.redeem_invite_code(text),
  public.disconnect_person(uuid), public.block_person(uuid), public.send_encouragement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.network_directory(), public.people_i_support(),
  public.send_connection_request(uuid, text, text), public.respond_connection_request(uuid, boolean),
  public.cancel_connection_request(uuid), public.create_invite_code(text), public.redeem_invite_code(text),
  public.disconnect_person(uuid), public.block_person(uuid), public.send_encouragement(uuid, text) TO authenticated;
