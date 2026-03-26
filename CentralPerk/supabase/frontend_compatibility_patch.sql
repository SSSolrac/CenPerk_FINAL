-- Frontend compatibility patch
-- Ensures frontend features (notifications, rewards settings, dynamic earning rules, exports)
-- have all required backend structures enabled.

begin;

create table if not exists public.earning_rules (
  id bigserial primary key,
  tier_label text not null,
  peso_per_point numeric(10,2) not null default 10,
  multiplier numeric(10,2) not null default 1,
  is_active boolean not null default true,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_earning_rules_tier_active_effective
  on public.earning_rules (tier_label, is_active, effective_at desc);

insert into public.earning_rules (tier_label, peso_per_point, multiplier, is_active)
values
  ('Bronze', 10, 1, true),
  ('Silver', 10, 1.2, true),
  ('Gold', 10, 1.5, true)
on conflict do nothing;

create table if not exists public.redemption_settings (
  id bigserial primary key,
  redemption_value_per_point numeric(12,6) not null default 0.01,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.redemption_settings (redemption_value_per_point, is_active)
select 0.01, true
where not exists (
  select 1 from public.redemption_settings where is_active = true
);

create index if not exists idx_notification_outbox_user_created
  on public.notification_outbox (user_id, created_at desc);

create index if not exists idx_notification_outbox_status_created
  on public.notification_outbox (status, created_at desc);

-- Enable realtime notifications for frontend bell menus.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_outbox'
  ) then
    alter publication supabase_realtime add table public.notification_outbox;
  end if;
end;
$$;

commit;
