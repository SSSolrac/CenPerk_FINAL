-- ============================================================
-- LOYALTY HUB FINAL DATABASE SCHEMA
-- Supabase PostgreSQL
-- Sprint 1 Complete
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

create table if not exists public.loyalty_members (
  id bigserial primary key,
  member_id bigint,
  member_number varchar(20) unique,
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique not null,
  phone varchar(20),
  points_balance int default 0,
  tier varchar(20) default 'Bronze',
  enrollment_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  transaction_id bigint,
  member_id bigint references public.loyalty_members(id) on delete cascade,
  transaction_type varchar(50),
  points int not null,
  amount_spent decimal(10,2) default 0,
  reason text,
  receipt_id text,
  transaction_date timestamptz default now(),
  expiry_date timestamptz default (now() + interval '1 year')
);

create table if not exists public.points_rules (
  id bigserial primary key,
  tier_label varchar(20) unique not null,
  min_points int not null,
  is_active boolean default true
);

create table if not exists public.rewards_catalog (
  id bigserial primary key,
  reward_id text unique not null,
  name text not null,
  description text,
  points_cost int not null,
  category text,
  image_url text,
  is_active boolean default true,
  expiry_date timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.earn_tasks (
  id bigserial primary key,
  task_code text unique not null,
  title text not null,
  description text,
  points int not null,
  icon_key text,
  default_completed boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('admin','customer')),
  updated_at timestamptz default now()
);

create table if not exists public.notification_outbox (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  channel text check (channel in ('email','sms','push')),
  subject text,
  message text,
  status text default 'pending',
  created_at timestamptz default now(),
  sent_at timestamptz
);

create table if not exists public.loyalty_member_profile_audit (
  id bigserial primary key,
  member_id bigint references public.loyalty_members(id),
  changed_by uuid references auth.users(id),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_members_email
on public.loyalty_members(lower(email));

create index if not exists idx_transactions_member
on public.loyalty_transactions(member_id);

create index if not exists idx_transactions_date
on public.loyalty_transactions(transaction_date desc);

create index if not exists idx_rewards_active
on public.rewards_catalog(is_active);

create index if not exists idx_tasks_active
on public.earn_tasks(is_active);

-- ============================================================
-- DEFAULT DATA
-- ============================================================

insert into public.points_rules (tier_label,min_points)
values
('Bronze',0),
('Silver',250),
('Gold',750)
on conflict (tier_label) do nothing;

-- ============================================================
-- MEMBER NUMBER GENERATION
-- ============================================================

create or replace function public.loyalty_generate_member_number()
returns text
language plpgsql
as $$
declare
 next_id bigint;
begin
 select coalesce(max(id),0)+1 into next_id
 from public.loyalty_members;

 return 'MEM-' || lpad(next_id::text,6,'0');
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

drop trigger if exists trg_member_number
on public.loyalty_members;

create trigger trg_member_number
before insert on public.loyalty_members
for each row
execute function public.set_member_number();

-- ============================================================
-- PROFILE AUDIT
-- ============================================================

create or replace function public.loyalty_log_profile_update()
returns trigger
language plpgsql
as $$
begin
 insert into public.loyalty_member_profile_audit
 (member_id,changed_by,old_data,new_data)
 values
 (old.id,auth.uid(),to_jsonb(old),to_jsonb(new));

 return new;
end;
$$;

drop trigger if exists trg_profile_audit
on public.loyalty_members;

create trigger trg_profile_audit
after update on public.loyalty_members
for each row
execute function public.loyalty_log_profile_update();

-- ============================================================
-- WELCOME NOTIFICATION
-- ============================================================

create or replace function public.loyalty_queue_welcome_notifications()
returns trigger
language plpgsql
as $$
begin

 insert into public.notification_outbox
 (user_id,channel,subject,message)
 values
 (
  auth.uid(),
  'email',
  'Welcome to LoyaltyHub',
  'Thank you for joining our loyalty program.'
 );

 return new;
end;
$$;

drop trigger if exists trg_welcome_notification
on public.loyalty_members;

create trigger trg_welcome_notification
after insert on public.loyalty_members
for each row
execute function public.loyalty_queue_welcome_notifications();

-- ============================================================
-- TIER RESOLUTION
-- ============================================================

create or replace function public.loyalty_resolve_tier(p_points int)
returns text
language plpgsql
as $$
declare v_tier text;
begin

 select tier_label
 into v_tier
 from public.points_rules
 where p_points >= min_points
 order by min_points desc
 limit 1;

 return coalesce(v_tier,'Bronze');

end;
$$;

-- ============================================================
-- POINT EXPIRY PROCESSOR
-- ============================================================

create or replace function public.loyalty_process_expired_points()
returns void
language plpgsql
security definer
as $$
begin

 insert into public.loyalty_transactions
 (member_id,transaction_type,points,reason)

 select
 member_id,
 'EXPIRY_DEDUCTION',
 -abs(sum(points)),
 'Points Expired'

 from public.loyalty_transactions
 where expiry_date < now()
 and points > 0
 group by member_id;

end;
$$;

-- ============================================================
-- ROLE HELPER FUNCTIONS
-- ============================================================

create or replace function public.app_current_role()
returns text
language sql
stable
as $$
 select role
 from public.app_user_roles
 where user_id = auth.uid()
$$;

create or replace function public.app_current_email()
returns text
language sql
stable
as $$
 select coalesce(auth.jwt() ->> 'email','')
$$;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.loyalty_members enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.rewards_catalog enable row level security;
alter table public.points_rules enable row level security;
alter table public.earn_tasks enable row level security;
alter table public.app_user_roles enable row level security;

-- ============================================================
-- ADMIN FULL ACCESS
-- ============================================================

create policy admin_all_members
on public.loyalty_members
for all
using (public.app_current_role() = 'admin');

create policy admin_all_transactions
on public.loyalty_transactions
for all
using (public.app_current_role() = 'admin');

create policy admin_all_rewards
on public.rewards_catalog
for all
using (public.app_current_role() = 'admin');

create policy admin_all_tasks
on public.earn_tasks
for all
using (public.app_current_role() = 'admin');

-- ============================================================
-- CUSTOMER ACCESS
-- ============================================================

create policy customer_view_own_member
on public.loyalty_members
for select
using (
 lower(email)=lower(public.app_current_email())
);

create policy customer_update_own_member
on public.loyalty_members
for update
using (
 lower(email)=lower(public.app_current_email())
);

create policy customer_view_transactions
on public.loyalty_transactions
for select
using (
 exists(
   select 1
   from public.loyalty_members m
   where m.id = loyalty_transactions.member_id
   and lower(m.email)=lower(public.app_current_email())
 )
);

create policy public_view_rewards
on public.rewards_catalog
for select
using (true);

create policy public_view_tasks
on public.earn_tasks
for select
using (true);

-- ============================================================
-- END OF SCHEMA
-- ============================================================
-- ============================================================
-- COMPLIANCE PATCHES (LYL-002,003,006,010,014,017)
-- ============================================================

-- LYL-002: THREAD-SAFE MEMBER NUMBER SEQUENCE
create sequence if not exists public.member_number_seq start 1 increment 1 minvalue 1 cache 1;

-- backfill the sequence so it always continues from current max numeric suffix
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

-- LYL-003: PROFILE FIELDS + UPDATE NOTIFICATION
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
      coalesce(target_user_id, auth.uid()),
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

-- LYL-006: EARNING RULES TABLE
create table if not exists public.earning_rules (
  id bigserial primary key,
  tier_label varchar(20) not null check (tier_label in ('Bronze','Silver','Gold')),
  peso_per_point numeric(10,2) not null check (peso_per_point > 0),
  multiplier numeric(10,2) not null default 1 check (multiplier > 0),
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_earning_rules_single_active_per_tier
on public.earning_rules (tier_label)
where is_active = true;

insert into public.earning_rules (tier_label, peso_per_point, multiplier, is_active)
values
  ('Bronze', 10, 1.0, true),
  ('Silver', 10, 1.25, true),
  ('Gold', 10, 1.50, true)
on conflict do nothing;

-- LYL-010: FIFO LOT LEDGER FOR POINTS
create table if not exists public.points_lots (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  source_transaction_id bigint references public.loyalty_transactions(id) on delete set null,
  points_earned int not null check (points_earned > 0),
  points_remaining int not null check (points_remaining >= 0),
  earned_at timestamptz not null default now(),
  expiry_date timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_points_lots_member_fifo
on public.points_lots (member_id, expiry_date asc, earned_at asc, id asc)
where points_remaining > 0;

create or replace function public.loyalty_consume_points_fifo(p_member_id bigint, p_points_to_consume int)
returns int
language plpgsql
as $$
declare
  remaining int := greatest(coalesce(p_points_to_consume, 0), 0);
  consumed int := 0;
  lot record;
  take_points int;
begin
  if remaining = 0 then
    return 0;
  end if;

  for lot in
    select id, points_remaining
    from public.points_lots
    where member_id = p_member_id
      and points_remaining > 0
    order by expiry_date asc, earned_at asc, id asc
    for update
  loop
    exit when remaining <= 0;

    take_points := least(lot.points_remaining, remaining);

    update public.points_lots
    set points_remaining = points_remaining - take_points
    where id = lot.id;

    remaining := remaining - take_points;
    consumed := consumed + take_points;
  end loop;

  return consumed;
end;
$$;

create or replace function public.loyalty_build_lot_on_earn()
returns trigger
language plpgsql
as $$
begin
  if new.points > 0 and upper(coalesce(new.transaction_type, '')) in ('PURCHASE', 'EARN', 'MANUAL_AWARD') then
    insert into public.points_lots(member_id, source_transaction_id, points_earned, points_remaining, earned_at, expiry_date)
    values (
      new.member_id,
      new.id,
      new.points,
      new.points,
      coalesce(new.transaction_date, now()),
      coalesce(new.expiry_date, coalesce(new.transaction_date, now()) + interval '12 months')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_points_lot_on_earn on public.loyalty_transactions;
create trigger trg_points_lot_on_earn
after insert on public.loyalty_transactions
for each row
execute function public.loyalty_build_lot_on_earn();

create or replace function public.loyalty_queue_expiry_warning_notifications()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  queued int := 0;
begin
  with expiring as (
    select
      l.member_id,
      m.email,
      sum(l.points_remaining)::int as expiring_points,
      min(l.expiry_date)::date as nearest_expiry
    from public.points_lots l
    join public.loyalty_members m on m.id = l.member_id
    where l.points_remaining > 0
      and l.expiry_date::date = (current_date + interval '30 days')::date
    group by l.member_id, m.email
  ), inserted as (
    insert into public.notification_outbox(user_id, channel, subject, message)
    select
      u.id,
      'email',
      'Points Expiry Reminder',
      format('You have %s points expiring on %s. Redeem them before expiry.', e.expiring_points, e.nearest_expiry)
    from expiring e
    left join auth.users u on lower(u.email) = lower(e.email)
    returning 1
  )
  select count(*) into queued from inserted;

  return queued;
end;
$$;

-- LYL-014: TIER UPGRADE HISTORY
create table if not exists public.tier_history (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  old_tier varchar(20) not null,
  new_tier varchar(20) not null,
  changed_at timestamptz not null default now(),
  reason text
);

create index if not exists idx_tier_history_member_date
on public.tier_history (member_id, changed_at desc);

create or replace function public.log_tier_change()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.tier, 'Bronze') is distinct from coalesce(new.tier, 'Bronze') then
    insert into public.tier_history(member_id, old_tier, new_tier, changed_at, reason)
    values (new.id, coalesce(old.tier, 'Bronze'), coalesce(new.tier, 'Bronze'), now(), 'Auto tier recalculation');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_tier_change on public.loyalty_members;
create trigger trg_log_tier_change
after update on public.loyalty_members
for each row
execute function public.log_tier_change();

-- LYL-017: CONFIG FOR MONETARY LIABILITY
create table if not exists public.redemption_settings (
  id bigserial primary key,
  redemption_value_per_point numeric(12,6) not null default 0.01,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.redemption_settings(redemption_value_per_point, is_active)
select 0.01, true
where not exists (
  select 1 from public.redemption_settings where is_active = true
);

create table if not exists public.liability_snapshots (
  id bigserial primary key,
  snapshot_month date not null,
  total_unredeemed_points bigint not null,
  monetary_liability numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique(snapshot_month)
);
