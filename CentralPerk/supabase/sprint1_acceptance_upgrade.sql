-- Sprint 1 Acceptance Upgrade Migration
-- Idempotent migration for LYL-002, LYL-003, LYL-006, LYL-010, LYL-014

begin;

-- ============================================================
-- 1) LYL-002: Member ID Generation (thread-safe sequence)
-- ============================================================
create sequence if not exists public.member_number_seq
  start with 1
  increment by 1
  minvalue 1
  cache 1;

select setval(
  'public.member_number_seq',
  greatest(
    coalesce(
      (
        select max(
          coalesce(nullif(regexp_replace(member_number, '\\D', '', 'g'), ''), '0')::bigint
        )
        from public.loyalty_members
      ),
      0
    ),
    0
  )
);

create or replace function public.loyalty_generate_member_number()
returns text
language plpgsql
as $$
declare
  seq_value bigint;
begin
  seq_value := nextval('public.member_number_seq');
  return 'MEM-' || lpad(seq_value::text, 6, '0');
end;
$$;

create or replace function public.set_member_number()
returns trigger
language plpgsql
as $$
begin
  if new.member_number is null then
    new.member_number := public.loyalty_generate_member_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_member_number on public.loyalty_members;
create trigger trg_member_number
before insert on public.loyalty_members
for each row
execute function public.set_member_number();

-- ============================================================
-- 2) LYL-003: Member Profile Management fields + notification trigger
-- ============================================================
alter table public.loyalty_members
  add column if not exists address text,
  add column if not exists profile_photo_url text;

create or replace function public.loyalty_queue_profile_update_notification()
returns trigger
language plpgsql
as $$
declare
  target_user_id uuid;
begin
  if (
    old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name
    or old.email is distinct from new.email
    or old.phone is distinct from new.phone
    or old.address is distinct from new.address
    or old.profile_photo_url is distinct from new.profile_photo_url
  ) then
    select u.id into target_user_id
    from auth.users u
    where lower(u.email) = lower(new.email)
    limit 1;

    insert into public.notification_outbox(user_id, channel, subject, message)
    values (
      target_user_id,
      'email',
      'Profile Updated',
      format('Hi %s, your loyalty profile was updated on %s.', coalesce(new.first_name, 'member'), now()::text)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profile_update_notification on public.loyalty_members;
create trigger trg_profile_update_notification
after update on public.loyalty_members
for each row
execute function public.loyalty_queue_profile_update_notification();

-- ============================================================
-- 3) LYL-006: Earning Rules
-- ============================================================
create table if not exists public.earning_rules (
  id bigserial primary key,
  tier_label varchar(20) not null references public.points_rules(tier_label) on update cascade,
  peso_per_point numeric(10,2) not null default 10 check (peso_per_point > 0),
  multiplier numeric(10,4) not null default 1 check (multiplier > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier_label)
);

insert into public.earning_rules (tier_label, peso_per_point, multiplier, is_active)
values
  ('Bronze', 10, 1.00, true),
  ('Silver', 10, 1.25, true),
  ('Gold', 10, 1.50, true)
on conflict (tier_label) do update
set
  peso_per_point = excluded.peso_per_point,
  multiplier = excluded.multiplier,
  is_active = excluded.is_active,
  updated_at = now();

-- ============================================================
-- 4) LYL-010: FIFO Points Lots + 30-day warning queue + pg_cron schedule
-- ============================================================
create table if not exists public.points_lots (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  source_transaction_id bigint references public.loyalty_transactions(id) on delete set null,
  original_points int not null check (original_points > 0),
  remaining_points int not null check (remaining_points >= 0),
  earned_at timestamptz not null default now(),
  expiry_date timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_points_lots_member_fifo
  on public.points_lots (member_id, expiry_date asc, earned_at asc, id asc)
  where remaining_points > 0;

create or replace function public.loyalty_queue_expiry_warning_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  with expiring_lots as (
    select
      l.member_id,
      m.email,
      sum(l.remaining_points)::integer as points_expiring,
      min(l.expiry_date)::date as nearest_expiry
    from public.points_lots l
    join public.loyalty_members m on m.id = l.member_id
    where l.remaining_points > 0
      and l.expiry_date::date = (current_date + interval '30 days')::date
    group by l.member_id, m.email
  ), inserted as (
    insert into public.notification_outbox(user_id, channel, subject, message)
    select
      u.id,
      'email',
      'Points Expiry Reminder',
      format(
        'You have %s points expiring on %s. Redeem them before expiry.',
        e.points_expiring,
        e.nearest_expiry
      )
    from expiring_lots e
    left join auth.users u on lower(u.email) = lower(e.email)
    returning 1
  )
  select count(*) into queued_count from inserted;

  return queued_count;
end;
$$;

create extension if not exists pg_cron;

do $cron$
declare
  existing_job_id integer;
begin
  begin
    select jobid
      into existing_job_id
    from cron.job
    where jobname = 'loyalty_expiry_warning_30d_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'loyalty_expiry_warning_30d_daily',
      '0 8 * * *',
      $job$select public.loyalty_queue_expiry_warning_notifications();$job$
    );
  exception
    when undefined_table then
      -- cron.job may not be accessible in restricted environments.
      null;
  end;
end;
$cron$;

-- ============================================================
-- 6) LYL-014: Tier History audit table + trigger
-- ============================================================
create table if not exists public.tier_history (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  old_tier varchar(20) not null,
  new_tier varchar(20) not null,
  changed_at timestamptz not null default now(),
  reason text
);

create index if not exists idx_tier_history_member_changed_at
  on public.tier_history (member_id, changed_at desc);

create or replace function public.log_tier_change()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.tier, 'Bronze') is distinct from coalesce(new.tier, 'Bronze') then
    insert into public.tier_history(member_id, old_tier, new_tier, changed_at, reason)
    values (
      new.id,
      coalesce(old.tier, 'Bronze'),
      coalesce(new.tier, 'Bronze'),
      now(),
      'Tier changed from member profile update'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_tier_change on public.loyalty_members;
create trigger trg_log_tier_change
after update on public.loyalty_members
for each row
execute function public.log_tier_change();

commit;
