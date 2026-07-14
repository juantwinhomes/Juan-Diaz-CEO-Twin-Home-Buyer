-- Sales practice mode — run ONCE in Supabase SQL Editor (additive; hiring
-- mode data is untouched).

alter table candidates
  add column if not exists mode text not null default 'hiring',
    -- 'hiring' | 'sales'
  add column if not exists difficulty text not null default 'easy';
    -- 'easy' | 'hard' (used by sales mode only)

alter table interviews
  add column if not exists candidate_notes text;
    -- the applicant's own prep notes typed on the call screen (sales mode)

alter table scores
  add column if not exists outcome text,
    -- sales mode: INTERESTED | NOT_INTERESTED | INCOMPLETE
  add column if not exists warmth int,
  add column if not exists confidence int,
  add column if not exists professionalism int,
  add column if not exists conversational int,
  add column if not exists completeness int,
  add column if not exists ending_handling int;
    -- sales-mode categories (hiring rows leave these null)
