-- Run this in the Supabase SQL Editor (dashboard project qmmdefcxzkcbcgbtsvmh -> SQL Editor).
-- Adds a staff_members table mapping @flowork.me emails to entity access, and replaces the
-- current "any authenticated user" RLS policies with ones scoped to that mapping.

create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  entity_id uuid references entities(id), -- null = access to all entities (IT/admin)
  created_at timestamptz default now()
);

alter table staff_members enable row level security;

create policy "staff can read own row"
  on staff_members for select
  using (email = auth.jwt() ->> 'email');

insert into staff_members (email, entity_id) values
  ('it@flowork.me', null),
  ('operations.dubaihills@flowork.me', (select id from entities where location_code = 'DH')),
  ('operations.vt@flowork.me', (select id from entities where location_code = 'VT'))
on conflict (email) do nothing;

-- Replace existing blanket "authenticated" policies with entity-scoped ones.
-- Adjust/drop the "drop policy" lines if your existing policy names differ.

drop policy if exists "Allow authenticated read" on entities;
drop policy if exists "Enable read access for authenticated users" on entities;
create policy "staff scoped entities select"
  on entities for select
  using (
    exists (
      select 1 from staff_members sm
      where sm.email = auth.jwt() ->> 'email'
        and (sm.entity_id is null or sm.entity_id = entities.id)
    )
  );

drop policy if exists "Allow authenticated read" on document_templates;
drop policy if exists "Enable read access for authenticated users" on document_templates;
create policy "staff scoped templates select"
  on document_templates for select
  using (
    exists (
      select 1 from staff_members sm
      where sm.email = auth.jwt() ->> 'email'
        and (sm.entity_id is null or sm.entity_id = document_templates.entity_id)
    )
  );

drop policy if exists "Allow authenticated read" on clients;
drop policy if exists "Enable read access for authenticated users" on clients;
create policy "staff scoped clients select"
  on clients for select
  using (
    exists (
      select 1 from staff_members sm
      where sm.email = auth.jwt() ->> 'email'
        and (sm.entity_id is null or sm.entity_id = clients.entity_id)
    )
  );
create policy "staff scoped clients insert"
  on clients for insert
  with check (
    exists (
      select 1 from staff_members sm
      where sm.email = auth.jwt() ->> 'email'
        and (sm.entity_id is null or sm.entity_id = clients.entity_id)
    )
  );

drop policy if exists "Allow authenticated read" on agreements;
drop policy if exists "Enable read access for authenticated users" on agreements;
create policy "staff scoped agreements select"
  on agreements for select
  using (
    exists (
      select 1 from staff_members sm
      where sm.email = auth.jwt() ->> 'email'
        and (sm.entity_id is null or sm.entity_id = agreements.entity_id)
    )
  );
create policy "staff scoped agreements insert"
  on agreements for insert
  with check (
    exists (
      select 1 from staff_members sm
      where sm.email = auth.jwt() ->> 'email'
        and (sm.entity_id is null or sm.entity_id = agreements.entity_id)
    )
  );
