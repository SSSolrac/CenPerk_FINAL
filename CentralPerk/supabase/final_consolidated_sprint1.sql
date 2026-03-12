-- ============================================================
-- LOYALTY HUB FINAL DATABASE SCHEMA (REPO-COMPATIBLE)
-- Supabase PostgreSQL
-- Sprint 1 Complete + Compliance Patched + Realtime Notifications + RLS DISABLED + Triggers Fixed
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

create table if not exists public.loyalty_members (
  id bigserial primary key,
  member_id bigint unique,
  member_number varchar(20) unique,
  first_name varchar(100),
  last_name varchar(100),
  email varchar(255) unique not null,
  phone varchar(20) unique,
  birthdate date,
  points_balance int default 0,
  tier varchar(20) default 'Bronze',
  enrollment_date date default current_date,
  created_at timestamptz default now(),
  address text,
  profile_photo_url text
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  transaction_id bigint unique,
  member_id bigint references public.loyalty_members(id) on delete cascade,
  transaction_type varchar(50),
  points int not null,
  amount_spent decimal(10,2) default 0,
  reason text,
  receipt_id text unique,
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

-- Compatibility safeguard for existing deployments before birthdate was introduced
alter table public.loyalty_members
  add column if not exists birthdate date;

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_members_email on public.loyalty_members(lower(email));
create index if not exists idx_members_member_number on public.loyalty_members(member_number);
create index if not exists idx_transactions_member on public.loyalty_transactions(member_id);
create index if not exists idx_transactions_date on public.loyalty_transactions(transaction_date desc);
create index if not exists idx_rewards_catalog_active on public.rewards_catalog(is_active);
create index if not exists idx_earn_tasks_active on public.earn_tasks(is_active);

-- ============================================================
-- DEFAULT / SEED DATA
-- ============================================================

insert into public.points_rules (tier_label,min_points)
values
('Bronze',0),
('Silver',250),
('Gold',750)
on conflict (tier_label) do nothing;

insert into public.rewards_catalog (reward_id, name, description, points_cost, category, image_url, is_active, expiry_date)
values
  ('RW001', 'Free Regular Coffee', 'Any regular-sized hot or iced coffee', 120, 'beverage', 'https://images.unsplash.com/photo-1657048167114-0942f3a2dc93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW002', 'Free Pastry', 'Choose from croissant, muffin, or danish', 150, 'food', 'https://images.unsplash.com/photo-1751151856149-5ebf1d21586a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW003', 'Free Large Specialty Drink', 'Any large-sized specialty beverage', 280, 'beverage', 'https://images.unsplash.com/photo-1680381724318-c8ac9fe3a484?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW004', 'Breakfast Combo', 'Coffee + breakfast sandwich or wrap', 350, 'food', 'https://images.unsplash.com/photo-1738682585466-c287db5404de?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW005', 'Coffee Beans 250g', 'Premium roasted coffee beans', 500, 'merchandise', 'https://images.unsplash.com/photo-1561766858-62033ae40ec3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW006', 'ZUS Branded Tumbler', 'Reusable insulated tumbler - 16oz', 800, 'merchandise', 'https://images.unsplash.com/photo-1666447616947-cd26838cb88b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW007', '$10 Gift Voucher', 'Redeemable for any purchase', 1000, 'voucher', 'https://images.unsplash.com/photo-1637910116483-7efcc9480847?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, null),
  ('RW008', 'Monthly Coffee Pass', '30 days of free regular coffee', 2500, 'voucher', 'https://images.unsplash.com/photo-1683888046273-38c106471115?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080', true, '2026-03-31T23:59:59Z')
on conflict (reward_id) do update
set
  name = excluded.name,
  description = excluded.description,
  points_cost = excluded.points_cost,
  category = excluded.category,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  expiry_date = excluded.expiry_date;

insert into public.earn_tasks (task_code, title, description, points, icon_key, default_completed, is_active)
values
  ('E001', 'Complete Your Profile', 'Add your birthday, phone number, and preferences', 100, 'user', true, true),
  ('E002', 'Download Mobile App', 'Get the ZUS Coffee app on your phone', 50, 'smartphone', true, true),
  ('E003', 'Monthly Survey', 'Share your feedback about our service', 50, 'clipboard', false, true),
  ('E004', 'Refer a Friend', 'Both get 250 points when they make first purchase', 250, 'users', false, true),
  ('E005', 'Follow on Social Media', 'Follow us on Instagram and Facebook', 30, 'share-2', false, true),
  ('E006', 'Leave a Review', 'Rate your experience on Google or App Store', 75, 'star', false, true)
on conflict (task_code) do update
set
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  icon_key = excluded.icon_key,
  default_completed = excluded.default_completed,
  is_active = excluded.is_active;

-- ============================================================
-- MEMBER NUMBER GENERATION
-- ============================================================

create sequence if not exists public.member_number_seq start 1 increment 1 minvalue 1 cache 1;

select setval(
  'public.member_number_seq',
  greatest(
    coalesce(
      (
        select max(
          coalesce(nullif(regexp_replace(member_number, '\D', '', 'g'), ''), '0')::bigint
        )
        from public.loyalty_members
      ),
      0
    ),
    1
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
-- NOTIFICATIONS: WELCOME, PROFILE, AND TRANSACTIONS
-- ============================================================

create or replace function public.loyalty_queue_welcome_notifications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_user_id uuid;
begin
 select id into target_user_id from auth.users where lower(email) = lower(new.email) limit 1;
 
 if target_user_id is not null then
   insert into public.notification_outbox(user_id, channel, subject, message)
   values (target_user_id, 'email', 'Welcome to LoyaltyHub', 'Thank you for joining our loyalty program.');
 end if;
 return new;
end;
$$;

drop trigger if exists trg_welcome_notification on public.loyalty_members;
create trigger trg_welcome_notification
after insert on public.loyalty_members
for each row
execute function public.loyalty_queue_welcome_notifications();

create or replace function public.loyalty_queue_profile_update_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if (
    old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name
    or old.email is distinct from new.email or old.phone is distinct from new.phone
    or old.birthdate is distinct from new.birthdate
    or old.address is distinct from new.address or old.profile_photo_url is distinct from new.profile_photo_url
  ) then
    select u.id into target_user_id from auth.users u where lower(u.email) = lower(new.email) limit 1;

    insert into public.notification_outbox(user_id, channel, subject, message)
    values (
      coalesce(target_user_id, auth.uid()), 'email', 'Profile Updated',
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

create or replace function public.loyalty_queue_transaction_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_user_id uuid;
  target_email text;
  action_word text;
begin
  select email into target_email from public.loyalty_members where id = new.member_id;
  select id into target_user_id from auth.users where lower(email) = lower(target_email) limit 1;

  if target_user_id is not null then
    if new.points > 0 then action_word := 'earned'; else action_word := 'spent'; end if;
    insert into public.notification_outbox(user_id, channel, subject, message)
    values (
      target_user_id, 'push', 'Points Update',
      format('You just %s %s points. Reason: %s', action_word, abs(new.points), coalesce(new.reason, 'Transaction'))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transaction_notification on public.loyalty_transactions;
create trigger trg_transaction_notification
after insert on public.loyalty_transactions
for each row
execute function public.loyalty_queue_transaction_notification();

-- ============================================================
-- AUDIT, ROLES & BALANCE AUTO-UPDATES
-- ============================================================

create or replace function public.app_current_role()
returns text language sql stable as $$ select role from public.app_user_roles where user_id = auth.uid() $$;

create or replace function public.app_current_email()
returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'email','') $$;

create or replace function public.loyalty_resolve_tier(p_points int)
returns text
language plpgsql
as $$
declare v_tier text;
begin
 select tier_label into v_tier from public.points_rules where p_points >= min_points and is_active = true order by min_points desc limit 1;
 return coalesce(v_tier,'Bronze');
end;
$$;

create or replace function public.loyalty_update_member_balance()
returns trigger
language plpgsql
as $$
declare
  new_balance int;
begin
  -- Calculate new balance
  update public.loyalty_members
  set points_balance = points_balance + new.points
  where id = new.member_id
  returning points_balance into new_balance;
  
  -- Auto-recalculate tier based on new balance
  update public.loyalty_members
  set tier = public.loyalty_resolve_tier(new_balance)
  where id = new.member_id;

  return new;
end;
$$;

drop trigger if exists trg_update_balance_on_tx on public.loyalty_transactions;
create trigger trg_update_balance_on_tx
after insert on public.loyalty_transactions
for each row
execute function public.loyalty_update_member_balance();

create or replace function public.loyalty_log_profile_update()
returns trigger
language plpgsql
as $$
begin
 insert into public.loyalty_member_profile_audit(member_id,changed_by,old_data,new_data)
 values(old.id,auth.uid(),to_jsonb(old),to_jsonb(new));
 return new;
end;
$$;

drop trigger if exists trg_profile_audit on public.loyalty_members;
create trigger trg_profile_audit
after update on public.loyalty_members
for each row
execute function public.loyalty_log_profile_update();

-- ============================================================
-- COMPLIANCE & POINTS LOTS (EARN AND SPEND LOGIC)
-- ============================================================

create table if not exists public.earning_rules (
  id bigserial primary key,
  tier_label varchar(20) not null check (tier_label in ('Bronze','Silver','Gold')),
  peso_per_point numeric(10,2) not null check (peso_per_point > 0),
  multiplier numeric(10,2) not null default 1 check (multiplier > 0),
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_earning_rules_single_active_per_tier on public.earning_rules (tier_label) where is_active = true;

insert into public.earning_rules (tier_label, peso_per_point, multiplier, is_active)
values ('Bronze', 10, 1.0, true), ('Silver', 10, 1.25, true), ('Gold', 10, 1.50, true) on conflict do nothing;

create table if not exists public.points_lots (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  source_transaction_id bigint unique references public.loyalty_transactions(id) on delete set null,
  original_points int not null check (original_points > 0),
  remaining_points int not null check (remaining_points >= 0),
  earned_at timestamptz not null default now(),
  expiry_date timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.points_lots
  add column if not exists original_points int,
  add column if not exists remaining_points int,
  add column if not exists earned_at timestamptz default now(),
  add column if not exists expiry_date timestamptz,
  add column if not exists created_at timestamptz default now();

do $$
begin
  -- Backfill from legacy column names used by earlier draft scripts.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'points_lots' and column_name = 'points_earned'
  ) then
    execute 'update public.points_lots set original_points = coalesce(original_points, points_earned)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'points_lots' and column_name = 'points_remaining'
  ) then
    execute 'update public.points_lots set remaining_points = coalesce(remaining_points, points_remaining)';
  end if;
end $$;

create index if not exists idx_points_lots_member_fifo on public.points_lots (member_id, expiry_date asc, earned_at asc, id asc) where remaining_points > 0;

-- Trigger to create a lot when points are earned (> 0)
create or replace function public.loyalty_build_lot_on_earn()
returns trigger language plpgsql as $$
begin
  if new.points > 0 and upper(coalesce(new.transaction_type, '')) in ('PURCHASE', 'EARN', 'MANUAL_AWARD') then
    insert into public.points_lots(member_id, source_transaction_id, original_points, remaining_points, earned_at, expiry_date)
    values (new.member_id, new.id, new.points, new.points, coalesce(new.transaction_date, now()), coalesce(new.expiry_date, coalesce(new.transaction_date, now()) + interval '12 months'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_points_lot_on_earn on public.loyalty_transactions;
create trigger trg_points_lot_on_earn after insert on public.loyalty_transactions for each row execute function public.loyalty_build_lot_on_earn();

-- Trigger to automatically consume lots (FIFO) when points are spent (< 0)
create or replace function public.loyalty_consume_lot_on_spend()
returns trigger language plpgsql as $$
declare
  remaining int := abs(new.points);
  lot record;
  consume_now int;
begin
  -- Only run this for redemptions
  if new.points >= 0 then
    return new;
  end if;

  for lot in
    select id, remaining_points
    from public.points_lots
    where member_id = new.member_id and remaining_points > 0
    order by expiry_date asc, earned_at asc, id asc
  loop
    exit when remaining <= 0;
    consume_now := least(lot.remaining_points, remaining);

    update public.points_lots
    set remaining_points = remaining_points - consume_now
    where id = lot.id;

    remaining := remaining - consume_now;
  end loop;

  -- Prevent the transaction from happening if they don't have enough points
  if remaining > 0 then
    raise exception 'Insufficient points for redemption.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_points_lot_on_spend on public.loyalty_transactions;
create trigger trg_points_lot_on_spend before insert on public.loyalty_transactions for each row execute function public.loyalty_consume_lot_on_spend();

-- Frontend RPC Wrapper
-- Compatibility behavior for this branch:
-- - Frontend already inserts a redemption transaction before calling this RPC.
-- - FIFO lot consumption is handled by the transaction trigger.
-- So this RPC is a no-op and remains only to keep frontend calls successful.
create or replace function public.loyalty_consume_points_fifo(p_member_id bigint, p_points_to_consume int, p_reason text default 'Reward Redemption')
returns int
language plpgsql
as $$
begin
  return 0;
end;
$$;

create or replace function public.loyalty_queue_expiry_warning_notifications()
returns int language plpgsql security definer set search_path = public as $$
declare queued int := 0;
begin
  with expiring as (
    select l.member_id, m.email, sum(l.remaining_points)::int as expiring_points, min(l.expiry_date)::date as nearest_expiry
    from public.points_lots l join public.loyalty_members m on m.id = l.member_id
    where l.remaining_points > 0 and l.expiry_date::date = (current_date + interval '30 days')::date
    group by l.member_id, m.email
  ), inserted as (
    insert into public.notification_outbox(user_id, channel, subject, message)
    select u.id, 'email', 'Points Expiry Reminder', format('You have %s points expiring on %s. Redeem them before expiry.', e.expiring_points, e.nearest_expiry)
    from expiring e left join auth.users u on lower(u.email) = lower(e.email)
    returning 1
  ) select count(*) into queued from inserted;
  return queued;
end;
$$;

create table if not exists public.tier_history (
  id bigserial primary key,
  member_id bigint not null references public.loyalty_members(id) on delete cascade,
  old_tier varchar(20) not null,
  new_tier varchar(20) not null,
  changed_at timestamptz not null default now(),
  reason text
);

create index if not exists idx_tier_history_member_date on public.tier_history (member_id, changed_at desc);

create or replace function public.log_tier_change() returns trigger language plpgsql as $$
begin
  if coalesce(old.tier, 'Bronze') is distinct from coalesce(new.tier, 'Bronze') then
    insert into public.tier_history(member_id, old_tier, new_tier, changed_at, reason) values (new.id, coalesce(old.tier, 'Bronze'), coalesce(new.tier, 'Bronze'), now(), 'Auto tier recalculation');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_tier_change on public.loyalty_members;
create trigger trg_log_tier_change after update on public.loyalty_members for each row execute function public.log_tier_change();

create table if not exists public.redemption_settings (
  id bigserial primary key,
  redemption_value_per_point numeric(12,6) not null default 0.01,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.redemption_settings(redemption_value_per_point, is_active)
select 0.01, true where not exists (select 1 from public.redemption_settings where is_active = true);

create table if not exists public.liability_snapshots (
  id bigserial primary key,
  snapshot_month date not null,
  total_unredeemed_points bigint not null,
  monetary_liability numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique(snapshot_month)
);

-- ============================================================
-- DISABLE ROW LEVEL SECURITY (DEVELOPMENT MODE)
-- ============================================================

drop policy if exists admin_all_members on public.loyalty_members;
drop policy if exists admin_all_transactions on public.loyalty_transactions;
drop policy if exists admin_all_rewards on public.rewards_catalog;
drop policy if exists admin_all_tasks on public.earn_tasks;
drop policy if exists customer_view_own_member on public.loyalty_members;
drop policy if exists customer_update_own_member on public.loyalty_members;
drop policy if exists customer_view_transactions on public.loyalty_transactions;
drop policy if exists public_view_rewards on public.rewards_catalog;
drop policy if exists public_view_tasks on public.earn_tasks;
drop policy if exists admin_all_earning_rules on public.earning_rules;
drop policy if exists admin_all_points_lots on public.points_lots;
drop policy if exists admin_all_tier_history on public.tier_history;
drop policy if exists admin_all_redemption on public.redemption_settings;
drop policy if exists admin_all_liability on public.liability_snapshots;
drop policy if exists customer_view_own_lots on public.points_lots;
drop policy if exists customer_view_own_tier_history on public.tier_history;
drop policy if exists public_view_earning_rules on public.earning_rules;

alter table public.loyalty_members disable row level security;
alter table public.loyalty_transactions disable row level security;
alter table public.rewards_catalog disable row level security;
alter table public.points_rules disable row level security;
alter table public.earn_tasks disable row level security;
alter table public.app_user_roles disable row level security;
alter table public.earning_rules disable row level security;
alter table public.points_lots disable row level security;
alter table public.tier_history disable row level security;
alter table public.redemption_settings disable row level security;
alter table public.liability_snapshots disable row level security;
alter table public.notification_outbox disable row level security;
alter table public.loyalty_member_profile_audit disable row level security;

-- ============================================================
-- AUTOMATED 30-DAY EXPIRY NOTIFICATIONS
-- ============================================================
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'loyalty-expiry-warning-30d') then
    perform cron.unschedule('loyalty-expiry-warning-30d');
  end if;
  perform cron.schedule(
    'loyalty-expiry-warning-30d',
    '0 8 * * *',
    $cron$select public.loyalty_queue_expiry_warning_notifications();$cron$
  );
exception
  when undefined_table then
    raise notice 'cron.job unavailable in this environment; skipping schedule.';
end $$;

-- ============================================================
-- API GRANTS
-- ============================================================
grant usage on schema public to anon, authenticated;
grant all privileges on all tables in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Make Realtime idempotent for notification_outbox
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_outbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_outbox;
  END IF;
END $$;
