-- THB Voice Screen — run this in Supabase SQL Editor (one time)

create table candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  role_applied text not null,
  status text not null default 'invited',
    -- invited | interviewed | scored | passed | failed | live_call | hired | declined
  interview_token uuid unique default gen_random_uuid(),
  token_expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) not null,
  consent_given boolean not null default false,
  consent_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  transcript jsonb,          -- [{role: 'agent'|'candidate', text, ts}]
  audio_url text,            -- storage path in interview-audio bucket
  completed boolean default false
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references interviews(id) not null,
  clarity int check (clarity between 1 and 5),
  directness int check (directness between 1 and 5),
  communication int check (communication between 1 and 5),
  knockout boolean not null default false,
  knockout_reason text,
  verdict text,              -- PASS | FAIL
  suggested_followup text,
  scored_by text not null default 'ai',  -- 'ai' or reviewer email
  notes text,
  created_at timestamptz default now()
);

-- Lock everything down. The app's server routes use the service-role key
-- (bypasses RLS). Logged-in admins (Seth/Carlo) get full read/write.
alter table candidates enable row level security;
alter table interviews enable row level security;
alter table scores enable row level security;

create policy "admins full access" on candidates
  for all to authenticated using (true) with check (true);
create policy "admins full access" on interviews
  for all to authenticated using (true) with check (true);
create policy "admins full access" on scores
  for all to authenticated using (true) with check (true);

-- Storage: create a PRIVATE bucket named `interview-audio` in the dashboard
-- (Storage -> New bucket -> uncheck "public"). Server uploads via service
-- role; admin playback uses signed URLs.
