-- Kääriku tournament — full database setup for a fresh Supabase project.
-- Paste into: Supabase dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run.

-- 1. Tables ------------------------------------------------------------------
-- gen_random_uuid() is built into Postgres 13+ core, which avoids depending on
-- where the uuid-ossp extension happens to be installed.

CREATE TABLE IF NOT EXISTS groups (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name     text NOT NULL,
  group_id uuid REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS rounds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            integer NOT NULL,
  status            text DEFAULT 'pending',
  start_time        timestamptz,
  end_time          timestamptz,
  is_paused         boolean DEFAULT false,
  total_paused_time integer DEFAULT 0,
  last_pause_start  timestamptz,
  type              text DEFAULT 'group'
);

CREATE TABLE IF NOT EXISTS matches (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid REFERENCES rounds(id),
  court    integer NOT NULL,
  team1_id uuid REFERENCES teams(id),
  team2_id uuid REFERENCES teams(id),
  score1   integer DEFAULT 0,
  score2   integer DEFAULT 0,
  status   text DEFAULT 'pending'
);

-- 2. Realtime ----------------------------------------------------------------
-- REPLICA IDENTITY FULL makes UPDATE events carry the old row.
ALTER TABLE matches REPLICA IDENTITY FULL;
ALTER TABLE rounds  REPLICA IDENTITY FULL;

-- Replica identity alone is NOT enough: without membership in the
-- supabase_realtime publication no postgres_changes events are emitted at all,
-- so /court/[courtId] and /standings would never live-update.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'rounds') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
  END IF;
END $$;

-- 3. Access ------------------------------------------------------------------
-- The app has no login: every browser talks to Postgres as the `anon` role.
-- With RLS enabled and no policies, SELECT silently returns [] instead of
-- erroring while every write fails — so the app looks like it is connected to
-- an empty database. RLS is left ON with explicit permissive policies, which
-- keeps Supabase's security linter quiet and leaves one obvious place to
-- tighten later (e.g. public reads, key-gated writes).
--
-- NOTE: as written, anyone with the URL can edit scores.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['groups', 'teams', 'rounds', 'matches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY anon_all ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- 4. Verify ------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('groups','teams','rounds','matches')) AS tables_created,
  (SELECT count(*) FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND tablename IN ('matches','rounds'))                   AS realtime_enabled,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'anon_all')   AS policies;
-- Expected: tables_created = 4, realtime_enabled = 2, policies = 4
