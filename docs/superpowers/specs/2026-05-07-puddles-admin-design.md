# Puddles Admin — Platform Administration Panel

**Date:** 2026-05-07
**Status:** Approved
**Authors:** Jesse Parkkonen, Claude

## Overview

Puddles Admin is an internal platform-level administration panel for Puddles Oy. It manages all TackBird operators (B2B customers), billing, sales pipeline, platform analytics, content moderation, hub partners, resident data, and system health — all in one place.

This is a separate application from the operator-admin (which individual operators use to manage their own buildings). Puddles Admin sits above all operators and gives the Puddles team full visibility and control over the entire platform.

## Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4, Helsinki Monochrome v3 |
| Backend | Supabase (shared instance: wfsghkseyyxkkalcqtzq) |
| Auth | Supabase Auth + `puddles_admins` table |
| Billing | Stripe Billing (subscriptions, invoices, webhooks) |
| Monitoring | Sentry integration (copied from tackbird-dashboard) |
| Deploy | Vercel (password-protected) |
| Typography | Bricolage Grotesque (headings) + Inter (body) |

**Repository:** `mainpuddles-hue/puddles-admin` (new, private)

**Relationship to existing systems:**
- **tackbird-mobile** — Same Supabase database (reads operators, profiles, posts, etc.)
- **tackbird-operator-admin** — Separate app for individual operators. Puddles Admin manages the operators themselves.
- **tackbird-dashboard** — Internal dev monitor. Stays as-is (Linear/GitHub). Sentry + Supabase health metrics copied to Puddles Admin.

## Authentication & Authorization

### Access Control

New table `puddles_admins` controls who can access the panel:

```sql
CREATE TABLE puddles_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'sales', 'support')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX idx_puddles_admins_profile ON puddles_admins(profile_id);
```

### Roles & Permissions

| Permission | superadmin | admin | sales | support |
|-----------|-----------|-------|-------|---------|
| Dashboard overview | Yes | Yes | Yes | Yes |
| Manage operators | Yes | Yes | View | View |
| Billing & invoices | Yes | Yes | No | No |
| Sales pipeline | Yes | Yes | Yes | No |
| Platform analytics | Yes | Yes | Yes | View |
| Content moderation | Yes | Yes | No | Yes |
| Hub partners | Yes | Yes | Yes | No |
| Resident data | Yes | Yes | No | Yes |
| System health | Yes | Yes | No | No |
| Manage puddles_admins | Yes | No | No | No |

### Auth Flow

1. User navigates to Puddles Admin
2. Supabase Auth login (email + password)
3. Server checks `puddles_admins` table for authenticated user
4. If no record → "Ei pääsyä" page
5. If record found → role loaded into session, sidebar rendered per permissions

## Navigation Structure

Sidebar navigation with 9 sections:

| Section | Route Group | Description |
|---------|------------|-------------|
| Yhteenveto | `/` | Dashboard overview with KPIs and alerts |
| Operaattorit | `/operators` | Operator CRUD, details, settings |
| Laskutus | `/billing` | Stripe subscriptions, MRR/ARR, invoices |
| Pipeline | `/pipeline` | Sales funnel: Lead → Active |
| Analytiikka | `/analytics` | Platform-wide metrics and charts |
| Moderointi | `/moderation` | Flagged content, user bans, reports |
| Hub-partnerit | `/partners` | Local business partnerships |
| Asukkaat | `/residents` | Cross-operator resident data |
| Jarjestelma | `/system` | Sentry errors, Supabase health |

Bottom of sidebar: user name, role badge, sign out.

## Pages — Detailed Specification

### 1. Yhteenveto (Dashboard)

**Route:** `/`

KPI cards (top row):
- Operaattoreita (count from `operators`)
- Asuntoja yhteensä (sum of `properties.unit_count`)
- Aktiivisia asukkaita (count of active tenancies)
- MRR (monthly recurring revenue from Stripe)
- Avoimia liideja (count of pipeline_leads not closed)
- Moderointijono (count of unresolved content flags)

Activity feed (recent events):
- New operators activated
- Pipeline stage changes
- Failed invoices (from billing_events)
- Content flags requiring attention
- Sentry alerts (critical errors)

### 2. Operaattorit

**Route:** `/operators`

**List view:**
- Table: name, business_id (Y-tunnus), subscription_tier, unit_count, active residents, status, created_at
- Filters: tier (pilot/active/enterprise), status
- Search by name or business_id
- "Luo operaattori" button

**Detail view:** `/operators/[id]`
- Header: operator name, logo, tier badge, status
- Tabs:
  - **Yleistiedot** — Name, business_id, billing_email, custom_domain, branding (colors, logo). Editable.
  - **Kiinteistot** — List of properties with unit counts, addresses, cities
  - **Asukkaat** — Active tenancies for this operator's properties
  - **Laskutus** — Stripe subscription details, invoice history, payment status
  - **Adminit** — operator_admins for this operator (manage who has access to operator-admin)
  - **Asetukset** — Feature flags, white-label config, notification preferences

**Create operator:**
- Form: name, business_id (Y-tunnus validation via PRH), billing_email, tier, per_unit_price
- Auto-creates Stripe customer + subscription
- Optionally link from pipeline lead (pre-fills data)

### 3. Laskutus (Billing)

**Route:** `/billing`

**Overview:**
- MRR (current monthly recurring revenue)
- ARR (annualized)
- MRR growth chart (last 12 months)
- Churn rate
- Average revenue per operator

**Subscriptions table:**
- Operator name, tier, unit_count, per_unit_price, monthly_amount, status, next_invoice_date
- Filter: active/past_due/cancelled
- Click → operator detail billing tab

**Invoices:**
- List from Stripe: operator, amount, status (paid/failed/pending), date
- Failed invoices highlighted with retry action

**Stripe integration:**
- Webhook endpoint receives invoice events → writes to `billing_events`
- Subscription lifecycle: create on operator activation, update on unit_count change, cancel on churn

### 4. Pipeline

**Route:** `/pipeline`

**Kanban board:**
- Columns: Lead | Kontaktoitu | Demo sovittu | Demo tehty | Trial | Neuvottelu | Voitettu | Hävitty
- Cards show: company_name, contact_name, unit_count estimate, estimated_mrr, days_in_stage
- Drag-and-drop between columns (stage change logged to pipeline_activities)
- Click card → detail panel

**Lead detail (slide-over panel):**
- Company info: name, business_id, contact, source
- Estimated deal: unit_count x per_unit_price = MRR
- Activity log: notes, calls, meetings, stage changes
- Add activity button
- "Konvertoi operaattoriksi" button (when stage = closed_won)

**Lead creation:**
- Form: company_name, contact info, source, estimated unit_count, notes
- Assigned_to defaults to current user

**Pipeline metrics (top bar):**
- Total leads, conversion rate, average deal size, average time to close

### 5. Analytiikka (Analytics)

**Route:** `/analytics`

**Platform metrics:**
- Total users (all operators combined)
- Weekly/monthly active users
- User growth chart (last 6 months)
- Posts, messages, events, maintenance requests per week

**Per-operator comparison:**
- Table: operator, residents, activity_score, NPS, retention_rate
- Sortable columns
- Helps identify which operators are thriving vs. need support

**Engagement:**
- Feature usage breakdown: posts, lending, events, polls, hub perks
- Peak usage times (heatmap)

### 6. Moderointi (Moderation)

**Route:** `/moderation`

**Content flags queue:**
- Flagged posts/messages/comments
- Each item: content preview, reporter, reason, timestamp
- Actions: dismiss flag, remove content, warn user, ban user
- Bulk actions for multiple items

**Banned users:**
- List of banned profiles
- Ban reason, date, banned_by
- Unban action

**Reports:**
- Aggregated view: flags per week, resolution time, top reporters

### 7. Hub-partnerit (Partners)

**Route:** `/partners`

**Partner list:**
- Table: name, category (cafe/gym/restaurant/etc.), commission_%, status, linked operators
- "Lisaa partneri" button

**Partner detail:** `/partners/[id]`
- Business info: name, business_id, contact, logo
- Commission settings
- Which operators include this partner's perks
- Activity/redemption stats (future)

### 8. Asukkaat (Residents)

**Route:** `/residents`

**Cross-operator resident view:**
- Search by name, email, phone across all operators
- Table: name, email, operator, property, unit, tenancy_status, joined_at
- Click → profile detail

**Profile detail (slide-over):**
- User info, verification status, trust tier
- Tenancy history (current + past)
- Activity summary (posts, messages, reports)
- Admin actions: reset password, change operator, ban

**Tenancy statistics:**
- Active, ended, pending counts per operator
- Average tenancy duration
- Turnover rate

### 9. Jarjestelma (System)

**Route:** `/system`

**Supabase health:**
- Database size, connection count
- Edge Function invocation counts and errors (last 24h)
- Realtime channel count

**Sentry errors:**
- Top 5 unresolved errors (last 7 days)
- Error count, affected users
- Link to Sentry dashboard

**App version stats:**
- Mobile app version distribution (from user-agent or analytics)
- Minimum supported version

## Database — New Tables

### puddles_admins

```sql
CREATE TABLE puddles_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'sales', 'support')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

ALTER TABLE puddles_admins ENABLE ROW LEVEL SECURITY;

-- Only superadmins can manage this table
CREATE POLICY puddles_admins_select ON puddles_admins FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY puddles_admins_manage ON puddles_admins FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role = 'superadmin'));
```

### pipeline_leads

```sql
CREATE TABLE pipeline_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  business_id text,
  contact_name text,
  contact_email text,
  contact_phone text,
  stage text NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead', 'contacted', 'demo_scheduled', 'demo_done', 'trial', 'negotiation', 'closed_won', 'closed_lost')),
  source text CHECK (source IN ('website', 'referral', 'outbound', 'event')),
  unit_count int,
  estimated_mrr_cents int,
  notes text,
  assigned_to uuid REFERENCES profiles(id),
  operator_id uuid REFERENCES operators(id),
  stage_changed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_leads_access ON pipeline_leads FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin', 'sales')));

CREATE INDEX idx_pipeline_leads_stage ON pipeline_leads(stage);
CREATE INDEX idx_pipeline_leads_assigned ON pipeline_leads(assigned_to);
```

### pipeline_activities

```sql
CREATE TABLE pipeline_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('note', 'email', 'call', 'meeting', 'stage_change')),
  description text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pipeline_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_activities_access ON pipeline_activities FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin', 'sales')));

CREATE INDEX idx_pipeline_activities_lead ON pipeline_activities(lead_id);
```

### billing_events

```sql
CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  stripe_invoice_id text,
  stripe_subscription_id text,
  event_type text NOT NULL CHECK (event_type IN ('invoice_paid', 'invoice_failed', 'subscription_created', 'subscription_updated', 'subscription_cancelled')),
  amount_cents int,
  period_start date,
  period_end date,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_events_access ON billing_events FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin')));

CREATE INDEX idx_billing_events_operator ON billing_events(operator_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);
```

### hub_partners

```sql
CREATE TABLE hub_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_id text,
  category text CHECK (category IN ('cafe', 'gym', 'restaurant', 'service', 'shop', 'other')),
  contact_email text,
  contact_phone text,
  logo_url text,
  commission_pct numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  operator_ids uuid[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hub_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY hub_partners_access ON hub_partners FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin', 'sales')));

CREATE INDEX idx_hub_partners_status ON hub_partners(status);
```

### platform_audit_log

```sql
CREATE TABLE platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_access ON platform_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY audit_log_insert ON platform_audit_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE INDEX idx_audit_log_actor ON platform_audit_log(actor_id);
CREATE INDEX idx_audit_log_target ON platform_audit_log(target_type, target_id);
CREATE INDEX idx_audit_log_created ON platform_audit_log(created_at DESC);
```

### Modification to existing table: operators

```sql
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_stripe_customer ON operators(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
```

## Edge Functions — New

### puddles-stripe-webhook

Receives Stripe webhook events for operator billing:
- `invoice.paid` → create billing_event, update operator status
- `invoice.payment_failed` → create billing_event, flag for attention
- `customer.subscription.created/updated/deleted` → sync to operators table

### puddles-create-subscription

Called when activating an operator:
1. Create Stripe customer (operator billing_email)
2. Create Stripe subscription (per_unit_price x unit_count)
3. Store stripe_customer_id + stripe_subscription_id on operators table
4. Log to platform_audit_log

## Route Structure (Next.js App Router)

```
app/
  layout.tsx              — Root layout: auth check, sidebar, Monochrome v3
  page.tsx                — Dashboard (Yhteenveto)

  (auth)/
    login/page.tsx        — Login form

  operators/
    page.tsx              — Operator list
    [id]/page.tsx         — Operator detail (tabs)
    new/page.tsx          — Create operator form

  billing/
    page.tsx              — Billing overview + invoices

  pipeline/
    page.tsx              — Kanban board

  analytics/
    page.tsx              — Platform metrics + charts

  moderation/
    page.tsx              — Flag queue + banned users

  partners/
    page.tsx              — Partner list
    [id]/page.tsx         — Partner detail
    new/page.tsx          — Create partner form

  residents/
    page.tsx              — Resident search + table

  system/
    page.tsx              — Sentry + Supabase health

  api/
    stripe-webhook/route.ts  — Stripe webhook handler

lib/
  supabase/
    client.ts             — Supabase server client (service role for admin queries)
    middleware.ts         — Auth middleware
  stripe/
    client.ts             — Stripe SDK client
  types.ts               — TypeScript interfaces for all new tables
  permissions.ts          — Role-based permission checks

components/
  sidebar.tsx             — Navigation sidebar (role-aware)
  data-table.tsx          — Reusable sortable/filterable table
  kpi-card.tsx            — KPI metric card
  kanban-board.tsx        — Drag-and-drop pipeline board
  slide-over.tsx          — Detail panel (leads, residents)
  audit-entry.tsx         — Audit log row
  empty-state.tsx         — Empty/no-access state
```

## Security

1. **Authentication:** Supabase Auth (email + password). No magic links needed for internal tool.
2. **Authorization:** `puddles_admins` table checked on every page load via server middleware. Role determines visible sections and allowed actions.
3. **RLS:** All new tables have RLS enabled. Policies check `puddles_admins` membership.
4. **Audit logging:** Every write operation (create, update, delete) logs to `platform_audit_log` with actor, action, target, and metadata.
5. **Stripe webhooks:** Verified via Stripe signature (`stripe.webhooks.constructEvent`).
6. **Deployment:** Vercel with deployment protection (password or Vercel Authentication).
7. **No public access:** No public API routes. All data requires authenticated puddles_admin session.

## Seed Data

On first migration:
- Insert Jesse Parkkonen (parkkonen.jesse@gmail.com) as `superadmin`
- Insert Waltteri Havola as `superadmin` (if profile exists)
- Create sample pipeline leads for testing

## Quality Assurance

- TypeScript strict mode, `tsc --noEmit` before every commit
- Server Components by default (no unnecessary client-side JS)
- Suspense boundaries per section (independent loading/error states)
- Graceful degradation: if Stripe/Sentry env vars missing, those sections show setup instructions
- All database queries via Supabase client with proper error handling
- Mobile-responsive sidebar (collapses to hamburger on small screens)
