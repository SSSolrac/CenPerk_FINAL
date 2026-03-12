# Acceptance Criteria Status (Pass/Fail Review)

Legend: **PASS** = implemented, **FAIL** = not implemented, **PARTIAL** = implemented but missing one or more required sub-criteria.

## 1) Registration & Member Creation

| Criteria | Status | Notes |
|---|---|---|
| Collect first name, last name, mobile, email, birthdate | PASS | Registration form and insert payload include all fields. |
| Mobile number must be unique | PARTIAL | Pre-check exists in app code, but DB schema does not enforce unique constraint on `phone`. |
| Email format validation | PASS | Email fields use `type="email"`. |
| Generate unique member ID (MEM-XXXXXX) | PASS | DB trigger generates `MEM-` + 6-digit sequence. |
| Can upload profile photo (optional) | PASS | Customer profile supports uploading and persisting profile photo URL. |

## 2) Member ID Rules

| Criteria | Status | Notes |
|---|---|---|
| Format MEM-000001 (sequential) | PASS | Uses `nextval(member_number_seq)` and `lpad(..., 6, '0')`. |
| 6-digit number with leading zeros | PASS | Implemented in SQL function. |
| No gaps in sequence | FAIL | Sequence-based IDs can have gaps after rollbacks/deletions. |
| IDs never reused | PASS | Sequence values are monotonically increasing and not reused by default. |
| Thread-safe generation | PASS | `nextval()`-based sequence generation is concurrency-safe. |

## 3) Member Profile Updates

| Criteria | Status | Notes |
|---|---|---|
| Can update name, email, mobile, address | PASS | Update flow sends these fields and schema includes address. |
| Cannot change member ID | PASS | Member ID displayed only; update function does not include member number mutation. |
| Changes logged in audit trail | PASS | DB trigger writes old/new record JSON to audit table. |
| Can update profile photo | PASS | Upload helper stores URL then profile update persists it. |
| Email notification on changes | PASS | DB trigger queues email notification on profile changes. |

## 4) Member Search & Lookup

| Criteria | Status | Notes |
|---|---|---|
| Search by member ID, mobile, name | PASS | Admin members page filters by these fields (plus email). |
| Partial name matching | PASS | Uses `includes()` on full name string. |
| Real-time search results | FAIL | Search runs only on explicit form submit, not per keystroke/live query. |
| Display recent members | PASS | Admin dashboard shows recent members list (`slice(0,10)`). |
| Click to view full profile | FAIL | Members table has no “view profile” navigation/action. |

## 5) Welcome Flow

| Criteria | Status | Notes |
|---|---|---|
| SMS sent immediately after registration | FAIL | Welcome trigger currently queues email only. |
| Welcome message with member ID | FAIL | Welcome email text does not include member ID. |
| Email with program details | FAIL | Message is generic and does not include program details. |
| Initial 0 points balance | PASS | Registration inserts `points_balance: 0`. |
| Welcome bonus consideration (future) | PASS | Welcome package logic exists (`ensureWelcomePackage`). |

## 6) Earning Rules

| Criteria | Status | Notes |
|---|---|---|
| Default 1 point per ₱10 spent | FAIL | No explicit peso-per-point rule table/logic in active flow. |
| Can configure earning rate | FAIL | Settings page currently configures tier thresholds only. |
| Different rates per member tier | FAIL | Tier thresholds exist; tier-based earn-rate computation not implemented. |
| Rules stored in database | PARTIAL | `points_rules` table exists, but it stores tier thresholds not earn rates. |
| Can activate/deactivate rules | PASS | `points_rules` contains `is_active`. |

## 7) Manual Points Adjustment

| Criteria | Status | Notes |
|---|---|---|
| Enter member ID and points amount | PASS | Admin flow awards points by member number with numeric input. |
| Add reason/notes (required) | FAIL | Reason prompt has a default value and is not strictly required. |
| Points added immediately | PASS | Award inserts transaction and updates balance via trigger. |
| Transaction logged | PASS | Insert goes to `loyalty_transactions`. |

## 8) Points Balance View

| Criteria | Status | Notes |
|---|---|---|
| Current balance displayed prominently | PASS | Customer dashboard card shows current balance. |
| Lifetime earned points shown | PASS | Dashboard shows lifetime points. |
| Lifetime redeemed points shown | FAIL | Not shown as a dedicated metric card in dashboard. |
| Balance updates in real-time | PARTIAL | App subscribes to realtime notification channel, but balance depends on refresh/fetch flows. |
| Transaction history available | PASS | Points Activity page displays transaction list. |

## 9) Transaction History

| Criteria | Status | Notes |
|---|---|---|
| Shows all earned/redeemed points | PASS | Activity list displays transactions and types. |
| Display date, type, amount, balance after | FAIL | “Balance after” is not shown per row. |
| Filter by date range | FAIL | Date range inputs are used for statements, not activity list filtering. |
| Filter by type | PASS | Type filter is implemented. |
| Paginated list | PASS | Client-side pagination is implemented. |

## 10) Points Expiry

| Criteria | Status | Notes |
|---|---|---|
| Points expire after 12 months | PASS | Transactions default expiry to `now() + interval '1 year'`. |
| Oldest points expire first (FIFO) | PASS | SQL introduces lot-based FIFO (`points_lots`) + consumption. |
| Expiry date stored per transaction | PASS | `expiry_date` column exists in transactions. |
| Member notified 30 days before expiry | PASS | SQL function queues 30-day warning notifications; scheduled cron included. |
| Expired points deducted automatically | PASS | SQL expiry job inserts expiry deductions and updates lot balances. |

## 11) Session Security

| Criteria | Status | Notes |
|---|---|---|
| Session expires after 30 minutes inactivity | FAIL | No explicit inactivity timer/idle logout logic in app. |
| Logout functionality | PASS | Admin/customer roots call `supabase.auth.signOut()`. |

## 12) Member Dashboard

| Criteria | Status | Notes |
|---|---|---|
| Shows current points balance | PASS | Implemented. |
| Shows member tier | PASS | Dashboard/profile display tier. |
| Recent transactions (last 5) | PARTIAL | Dashboard includes activity indicators, but explicit “last 5” list is not clearly enforced. |
| Points expiring soon alert | PASS | User snapshot computes expiring soon indicator and UI components exist. |
| Quick actions (redeem, view history) | PASS | Dashboard links to rewards and activity pages. |

## 13) Statement Generation

| Criteria | Status | Notes |
|---|---|---|
| Generate PDF statement | PASS | Points Activity includes PDF generation. |
| Shows all transactions in date range | PASS | Statement builder called with date range. |
| Opening and closing balance | PASS | Statement data builder computes opening/closing balances. |
| Branded template | PASS | Generated HTML includes branded “Central Perk” statement formatting. |
| Can email to member | PASS | `emailStatement()` queues statement email via notification outbox. |

## 14) Customer Self-Service Updates (Restricted)

| Criteria | Status | Notes |
|---|---|---|
| Can update email and address only | FAIL | Current profile editor allows updating name, phone, birthdate, and photo too. |
| Cannot change mobile (security) | FAIL | Phone remains editable in profile page. |
| Changes require OTP confirmation | FAIL | No OTP confirmation flow integrated in profile update. |
| Success notification | PASS | UI toast shown after successful save. |
| Audit log maintained | PASS | Audit trigger records updates. |

## 15) Reports & Analytics

| Criteria | Status | Notes |
|---|---|---|
| New members per day/week/month | PARTIAL | Monthly trend exists; day/week granularity not shown. |
| Total active members | PARTIAL | Total members shown, but explicit active/inactive logic is limited. |
| Growth percentage | PASS | Dashboard shows month-over-month growth %. |
| Chart visualization | PASS | Uses bar/pie charts in admin dashboard. |
| Can filter by date range | FAIL | No general date-range controls on these admin charts. |

| Criteria | Status | Notes |
|---|---|---|
| Total unredeemed points | PASS | Points liability metric shown. |
| Monetary value (points × redemption value) | PASS | Redemption value setting and liability computations are present. |
| Breakdown by member tier | PASS | Tier distribution shown and used in reporting. |
| Historical trend | PARTIAL | Liability snapshots schema exists; trend visualization/export not clearly complete in UI. |
| Export to Excel | FAIL | CSV/PDF exports exist; no Excel export implementation found. |

| Criteria | Status | Notes |
|---|---|---|
| Active vs inactive members | FAIL | Dedicated active/inactive report not implemented. |
| Last activity date per member | FAIL | Not shown as a report column in admin analytics. |
| Points earned per month | PARTIAL | Some monthly trend exists, but no explicit dedicated report by member segment. |
| Member segmentation | PARTIAL | Tier segmentation exists; broader segmentation controls are not explicit. |
| Can filter by activity level | FAIL | No activity-level filter controls found. |

| Criteria | Status | Notes |
|---|---|---|
| Total points redeemed per period | PARTIAL | Total redeemed shown, period filtering not explicit in report UI. |
| Most popular rewards | FAIL | No reward popularity analytics report found. |
| Redemption rate (redeemed/earned) | FAIL | No direct redeemed/earned rate metric found. |
| Trend over time | PARTIAL | Limited charting exists; dedicated redemption trend not explicit. |
| Export capability | PASS | Transaction export capability exists (CSV/PDF). |

| Criteria | Status | Notes |
|---|---|---|
| Count of members per tier | PASS | Tier distribution metrics/chart exists. |
| Percentage distribution | PASS | Pie chart implies proportional distribution. |
| Tier movement trends | PARTIAL | Tier history table and profile timeline exist; no dedicated trend chart in admin report. |
| Visual chart (pie/bar) | PASS | Pie and bar charts implemented. |
| Can filter by date | FAIL | No date filter for tier distribution report. |

## Overall

- **PASS:** 46
- **PARTIAL:** 13
- **FAIL:** 21

Overall result: **PARTIALLY PASSED** (core flows work, but several acceptance items are still missing or only partially implemented).
