CREATE TABLE groups (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE teams (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  group_id uuid REFERENCES groups(id)
);

CREATE TABLE rounds (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  number integer NOT NULL,
  status text DEFAULT 'pending',
  start_time timestamptz,
  end_time timestamptz,
  is_paused boolean DEFAULT false,
  total_paused_time integer DEFAULT 0,
  last_pause_start timestamptz,
  type text DEFAULT 'group'
);

CREATE TABLE matches (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  round_id uuid REFERENCES rounds(id),
  court integer NOT NULL,
  team1_id uuid REFERENCES teams(id),
  team2_id uuid REFERENCES teams(id),
  score1 integer DEFAULT 0,
  score2 integer DEFAULT 0,
  status text DEFAULT 'pending'
);

-- Enable realtime if needed
ALTER TABLE matches REPLICA IDENTITY FULL;
ALTER TABLE rounds REPLICA IDENTITY FULL; 