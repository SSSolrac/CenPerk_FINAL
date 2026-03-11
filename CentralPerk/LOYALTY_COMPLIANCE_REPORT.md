# Loyalty System Compliance Report

## Scope and Method
This report reviews backend logic, SQL schemas/migrations, and frontend UI flows against the provided acceptance criteria (LYL-002, 003, 006, 010, 013, 014, 017).

Reviewed areas:
- Database SQL: `supabase/final_consolidated_sprint1.sql`, `supabase/sprint1_gap_closure.sql`
- Backend/data access layer: `src/app/lib/loyalty-supabase.ts`
- Frontend UI: registration, profile, points activity, admin dashboard/reports

---

## 1) Member ID Generation (LYL-002)

### [Partially Met]

**What is implemented**
- Database function generates `MEM-` prefixed IDs with zero-padding to 6 digits:
  - `loyalty_generate_member_number()` returns `'MEM-' || lpad(next_id::text,6,'0')`.
- Trigger `trg_member_number` sets `member_number` if not provided.

**Where**
- `supabase/final_consolidated_sprint1.sql`
  - `loyalty_generate_member_number()`
  - `set_member_number()`
  - `trg_member_number`

**Gaps found**
- Registration UI bypasses DB trigger by generating and inserting a custom ID (`ZUS...`) from client code.
  - Not compliant with required format `MEM-000001`.
- DB generation algorithm uses `max(id)+1`, which is **not thread-safe** under concurrent inserts.
- “No gaps” cannot be guaranteed with this approach (rollbacks/deletes/manual operations can still create non-contiguous IDs).
- “Never reused” is not strictly guaranteed if records with highest id are deleted and `max(id)+1` is reused.

**Where the gap is visible**
- `src/app/components/RegistrationCard.tsx`
  - `generateMemberNumber()` creates `ZUS${maxSuffix + 1}` and inserts `member_number` directly.

### Suggested implementation
1. Remove client-side member-number generation and let DB assign `member_number` via trigger.
2. Replace `max(id)+1` with a dedicated sequence and `nextval()` in SQL.
3. For strict “no gaps” requirement, use an allocator table with serialized/transactional increment semantics (note: strict no-gap under rollback is operationally expensive and atypical in high-concurrency systems).

```sql
-- safer ID source
create sequence if not exists public.member_number_seq start 1;

create or replace function public.loyalty_generate_member_number()
returns text language plpgsql as $$
declare
  n bigint;
begin
  n := nextval('public.member_number_seq');
  return 'MEM-' || lpad(n::text, 6, '0');
end;
$$;
```

```ts
// RegistrationCard.tsx: do NOT send member_number
await supabase.from("loyalty_members").insert({
  first_name: formData.firstName,
  last_name: formData.lastName,
  email: formData.email,
  phone: formData.phone,
  points_balance: 0,
  tier: "Bronze",
});
```

---

## 2) Member Profile Management (LYL-003)

### [Partially Met]

**What is implemented**
- Members can update name, email, and mobile/phone via profile UI and `updateMemberProfile()`.
- Member ID is displayed but not editable in profile update flow.
- Profile changes are logged in audit trail table via trigger `trg_profile_audit`.
- Profile photo upload exists in UI.

**Where**
- `src/app/customer-panel/pages/profile.tsx`
- `src/app/lib/loyalty-supabase.ts` (`updateMemberProfile`)
- `supabase/final_consolidated_sprint1.sql` (`loyalty_member_profile_audit`, `loyalty_log_profile_update`, `trg_profile_audit`)

**Gaps found**
- Address field is not present in schema or update API/UI.
- Profile photo is only stored in local state (data URL), not persisted in DB/storage.
- No email notification on profile change (only welcome notification trigger exists on insert).

### Suggested implementation
- Add `address` and `profile_photo_url` columns to `loyalty_members`.
- Upload image to Supabase Storage and persist URL.
- Add update-notification trigger/outbox entry for profile changes.

```sql
alter table public.loyalty_members
  add column if not exists address text,
  add column if not exists profile_photo_url text;

create or replace function public.loyalty_queue_profile_change_notification()
returns trigger language plpgsql as $$
begin
  if row_to_json(old) is distinct from row_to_json(new) then
    insert into public.notification_outbox(user_id, channel, subject, message)
    values (auth.uid(), 'email', 'Profile Updated', 'Your profile details were changed.');
  end if;
  return new;
end;
$$;
```

---

## 3) Points Earning Rules (LYL-006)

### [Partially Met]

**What is implemented**
- Rules are stored in DB (`points_rules`) and include `is_active`.
- Tier-based thresholds (Bronze/Silver/Gold by `min_points`) are loaded from DB for tier resolution.

**Where**
- `supabase/final_consolidated_sprint1.sql` (`points_rules`)
- `src/app/lib/loyalty-supabase.ts` (`fetchTierRules`)
- `src/app/lib/loyalty-engine.ts` (`resolveTier`)

**Gaps found**
- No earning-rate model (e.g., points per currency amount) in DB.
- No default rule enforced for `1 point per ₱10`.
- No configurable earning rate in admin settings (settings page edits tier thresholds, not earning rates).
- No tier-specific earn-rate application during purchase award logic.

### Suggested implementation
- Add earning rule table with spend divisor and per-tier multiplier.
- Apply active rule in purchase points computation.

```sql
create table if not exists public.earning_rules (
  id bigserial primary key,
  tier_label text not null check (tier_label in ('Bronze','Silver','Gold')),
  peso_per_point numeric(10,2) not null default 10,
  multiplier numeric(10,2) not null default 1,
  is_active boolean not null default true,
  effective_at timestamptz not null default now()
);
```

```ts
// pseudo in award flow
const rule = await getActiveEarningRule(memberTier);
const basePoints = Math.floor(amountSpent / rule.peso_per_point);
const earned = Math.floor(basePoints * rule.multiplier);
```

---

## 4) Points Expiry Rules (LYL-010)

### [Partially Met]

**What is implemented**
- Expiry date exists in schema (`expiry_date`) and purchase awards set ~12-month expiry.
- Expired points are deducted automatically by expiry processing routines.
- 30-day upcoming expiry is detected in member snapshot for UI display.

**Where**
- `supabase/final_consolidated_sprint1.sql` (`expiry_date`, `loyalty_process_expired_points`)
- `src/app/lib/loyalty-supabase.ts` (`awardMemberPoints`, `processMemberExpiredPoints`, upcoming expiry calculation)
- `supabase/sprint1_gap_closure.sql` (scheduled cron pattern)

**Gaps found**
- Current deduction logic aggregates all expired earned points minus all prior expiry deductions; it is **not FIFO-lot consumption**.
- No implemented notification dispatch 30 days before expiry (only computation).
- In final schema file, no scheduler setup is included; scheduler appears as a separate migration recommendation.

### Suggested implementation
- Introduce a points-lot ledger (`earned_lots`, `consumed_points`) and consume oldest available lots first.
- Add daily job to queue notifications for lots expiring in 30 days.

```sql
-- example notification job predicate
select member_id, sum(remaining_points)
from public.points_lots
where expiry_date::date = (current_date + interval '30 days')::date
  and remaining_points > 0
group by member_id;
```

---

## 5) Statement Generation (LYL-013)

### [Partially Met]

**What is implemented**
- Statement can be downloaded/printed as PDF from points activity page.
- Transaction history is included in generated output.

**Where**
- `src/app/customer-panel/pages/points-activity.tsx` (`downloadPdf`, `downloadCsv`)

**Gaps found**
- No selected date-range filter applied to generated statement data.
- No opening and closing balances shown for the selected period.
- Template is plain print HTML, not clearly branded.
- No functionality to email statement to member.

### Suggested implementation
- Add date range controls and query filter.
- Compute opening balance as of `startDate - 1` and closing balance as of `endDate`.
- Build branded HTML/PDF template.
- Add “Email Statement” action that inserts into `notification_outbox` with attachment link.

---

## 6) Member Tier Display (LYL-014)

### [Partially Met]

**What is implemented**
- Current tier is shown.
- Tier benefits are shown.
- Required points to next tier are shown.
- Visual tier indicator/progress bar exists.

**Where**
- `src/app/customer-panel/pages/profile.tsx`

**Gaps found**
- Tier upgrade history is not shown anywhere.

### Suggested implementation
- Add table `tier_history(member_id, from_tier, to_tier, changed_at, reason)`.
- Record row whenever tier changes in points award/redeem/expiry paths.
- Render timeline in profile page.

---

## 7) Points Liability Report (LYL-017)

### [Partially Met]

**What is implemented**
- Total unredeemed points (points liability) is shown.
- Breakdown by member tier is shown (chart).

**Where**
- `src/app/admin-panel/hooks/use-admin-data.ts` (`pointsLiability`, `tierDistribution`)
- `src/app/admin-panel/pages/rewards.tsx`

**Gaps found**
- No monetary liability calculation (points × redemption value).
- No liability historical trend chart/time-series.
- No Excel export functionality.

### Suggested implementation
- Add configurable redemption value (e.g., `redemption_value_per_point`).
- Compute and display monetary liability.
- Persist monthly snapshots (`liability_snapshots`) for trend chart.
- Add export to `.xlsx` using `exceljs` or server-side export endpoint.

```ts
const monetaryLiability = metrics.pointsLiability * redemptionValuePerPoint;
```

---

## Overall Summary
- **Fully Met:** none of the 7 criteria are fully complete end-to-end.
- **Partially Met:** all 7 criteria have at least a base implementation.
- **Missing sub-requirements:** strict thread-safe/no-gap member IDs, address/photo persistence + notification on profile updates, earning-rate engine, FIFO expiry + 30-day notifications + robust scheduler, full statement requirements, tier upgrade history, monetary/trend/excel liability reporting.
