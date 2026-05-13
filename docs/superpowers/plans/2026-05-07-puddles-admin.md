# Puddles Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a platform-level admin panel for Puddles Oy to manage all TackBird operators, billing, sales pipeline, analytics, moderation, hub partners, residents, and system health.

**Architecture:** Standalone Next.js 16 app (App Router, Server Components) with Tailwind CSS v4 and Helsinki Monochrome v3 design system. Connects to the existing shared Supabase instance. Uses shadcn/ui components, Stripe Billing for operator subscriptions, and Sentry for error monitoring.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Tailwind CSS v4, @supabase/ssr, Stripe SDK, shadcn/ui, Lucide React, Recharts, Zod, class-variance-authority

**Spec:** `docs/superpowers/specs/2026-05-07-puddles-admin-design.md`

**Existing patterns to follow:** `tackbird-operator-admin` (same stack, same Supabase, same design tokens)

---

## File Structure

```
puddles-admin/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    — Root layout: fonts, metadata
│   │   ├── globals.css                   — Helsinki Monochrome v3 tokens
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx            — Email + password login
│   │   │   └── auth/callback/route.ts    — OAuth/magic link callback
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                — Auth check, puddles_admins query, sidebar
│   │   │   ├── page.tsx                  — Dashboard overview (KPIs + activity feed)
│   │   │   ├── operators/
│   │   │   │   ├── page.tsx              — Operator list table
│   │   │   │   ├── [id]/page.tsx         — Operator detail (tabbed)
│   │   │   │   └── new/page.tsx          — Create operator form
│   │   │   ├── billing/
│   │   │   │   └── page.tsx              — MRR/ARR, subscriptions, invoices
│   │   │   ├── pipeline/
│   │   │   │   └── page.tsx              — Kanban board + lead forms
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx              — Platform metrics + charts
│   │   │   ├── moderation/
│   │   │   │   └── page.tsx              — Flag queue + banned users
│   │   │   ├── partners/
│   │   │   │   ├── page.tsx              — Partner list
│   │   │   │   ├── [id]/page.tsx         — Partner detail
│   │   │   │   └── new/page.tsx          — Create partner form
│   │   │   ├── residents/
│   │   │   │   └── page.tsx              — Cross-operator resident search
│   │   │   └── system/
│   │   │       └── page.tsx              — Sentry + Supabase health
│   │   └── api/
│   │       └── stripe-webhook/route.ts   — Stripe webhook handler
│   ├── components/
│   │   ├── ui/                           — shadcn components (button, card, input, table, badge, etc.)
│   │   ├── sidebar.tsx                   — Role-aware navigation sidebar
│   │   ├── topbar.tsx                    — User info + mobile menu + sign out
│   │   ├── no-access.tsx                 — Permission denied screen
│   │   ├── kpi-card.tsx                  — KPI metric display
│   │   ├── data-table.tsx                — Reusable sortable/filterable table
│   │   ├── kanban-board.tsx              — Drag-and-drop pipeline board
│   │   ├── slide-over.tsx                — Detail side panel
│   │   ├── empty-state.tsx               — Empty/unconfigured state
│   │   └── audit-entry.tsx               — Audit log row display
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                 — Browser Supabase client
│   │   │   ├── server.ts                 — Server Supabase client
│   │   │   └── middleware.ts             — Auth session middleware
│   │   ├── stripe/
│   │   │   └── client.ts                 — Stripe SDK instance
│   │   ├── sentry/
│   │   │   └── client.ts                 — Sentry REST API client
│   │   ├── types.ts                      — TypeScript interfaces for all tables
│   │   ├── permissions.ts                — Role-based permission matrix
│   │   ├── audit.ts                      — Audit log helper (logAction)
│   │   ├── utils.ts                      — cn() utility
│   │   └── env.ts                        — Type-safe env var helpers
│   ├── actions/
│   │   ├── operators.ts                  — Server actions: create/update/delete operators
│   │   ├── pipeline.ts                   — Server actions: lead CRUD, stage changes
│   │   ├── partners.ts                   — Server actions: partner CRUD
│   │   ├── moderation.ts                 — Server actions: flag resolution, bans
│   │   └── residents.ts                  — Server actions: resident admin actions
│   └── middleware.ts                     — Root middleware (auth redirects)
├── components.json                       — shadcn configuration
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── .env.local
└── .gitignore
```

---

## Phase 1: Foundation

### Task 1: Create repository and scaffold project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.local`, `components.json`
- Create: `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Create GitHub repo**

```bash
~/.local/bin/gh repo create mainpuddles-hue/puddles-admin --private --clone
cd /Users/jesseparkkonen/puddles-admin
```

- [ ] **Step 2: Initialize Next.js 16 project**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-turbopack --import-alias "@/*"
```

When prompted, accept defaults. This creates the base project structure.

- [ ] **Step 3: Install dependencies**

Match the operator-admin stack exactly:

```bash
npm install @supabase/ssr@^0.10.2 @supabase/supabase-js@^2.105.3 stripe@^18 lucide-react@^1.14.0 recharts@^3.8.1 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.5.0 zod@^4.4.3 date-fns@^4.1.0 @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 4: Install shadcn**

```bash
npx shadcn@latest init
```

Select: style=base-nova, rsc=yes, tsx=yes, baseColor=neutral, cssVariables=yes, iconLibrary=lucide. Then install base components:

```bash
npx shadcn@latest add button card input label table badge select tabs sheet dialog dropdown-menu separator avatar tooltip
```

- [ ] **Step 5: Write `src/app/globals.css`**

Copy the Helsinki Monochrome v3 tokens from operator-admin exactly — including all light/dark mode variables, sidebar tokens, chart colors, and radius scale. The file must match `tackbird-operator-admin/src/app/globals.css` precisely.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter);
  --font-heading: var(--font-bricolage);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: #F5F6F7;
  --foreground: #1A1D1F;
  --card: #FFFFFF;
  --card-foreground: #1A1D1F;
  --popover: #FFFFFF;
  --popover-foreground: #1A1D1F;
  --primary: #1A1D1F;
  --primary-foreground: #F5F6F7;
  --secondary: #EEF0F2;
  --secondary-foreground: #1A1D1F;
  --muted: #EEF0F2;
  --muted-foreground: #6B7075;
  --accent: #EEF0F2;
  --accent-foreground: #1A1D1F;
  --destructive: #C44536;
  --border: #E8EAEC;
  --input: #E8EAEC;
  --ring: #8B8F94;
  --success: #2B8A62;
  --warning: #A97A1E;
  --info: #3B7DD8;
  --chart-1: #3B7DD8;
  --chart-2: #C75B3A;
  --chart-3: #7C5CBF;
  --chart-4: #2B8A62;
  --chart-5: #A97A1E;
  --radius: 0.875rem;
  --sidebar: #F5F6F7;
  --sidebar-foreground: #1A1D1F;
  --sidebar-primary: #1A1D1F;
  --sidebar-primary-foreground: #F5F6F7;
  --sidebar-accent: #EEF0F2;
  --sidebar-accent-foreground: #1A1D1F;
  --sidebar-border: #E8EAEC;
  --sidebar-ring: #8B8F94;
}

.dark {
  --background: #0E1012;
  --foreground: #F5F6F7;
  --card: #17191C;
  --card-foreground: #F5F6F7;
  --popover: #17191C;
  --popover-foreground: #F5F6F7;
  --primary: #F5F6F7;
  --primary-foreground: #0E1012;
  --secondary: #202326;
  --secondary-foreground: #F5F6F7;
  --muted: #202326;
  --muted-foreground: #8B8F94;
  --accent: #202326;
  --accent-foreground: #F5F6F7;
  --destructive: #FF453A;
  --border: #2E3136;
  --input: #3A3E44;
  --ring: #535A60;
  --success: #6FCF97;
  --warning: #A97A1E;
  --info: #3B7DD8;
  --chart-1: #3B7DD8;
  --chart-2: #C75B3A;
  --chart-3: #7C5CBF;
  --chart-4: #6FCF97;
  --chart-5: #A97A1E;
  --sidebar: #17191C;
  --sidebar-foreground: #F5F6F7;
  --sidebar-primary: #F5F6F7;
  --sidebar-primary-foreground: #0E1012;
  --sidebar-accent: #202326;
  --sidebar-accent-foreground: #F5F6F7;
  --sidebar-border: #2E3136;
  --sidebar-ring: #535A60;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 6: Write `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Puddles Admin",
  description: "Puddles Oy — Platform Administration",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi" className={`${inter.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Write `.env.local`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://wfsghkseyyxkkalcqtzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<copy from operator-admin .env.local>
SUPABASE_SERVICE_ROLE_KEY=<copy from tackbird-dashboard .env.local>
STRIPE_SECRET_KEY=<from Stripe dashboard>
STRIPE_WEBHOOK_SECRET=<from Stripe dashboard>
SENTRY_AUTH_TOKEN=<from Sentry>
SENTRY_ORG=puddles
SENTRY_PROJECT=tackbird-mobile
```

- [ ] **Step 9: Verify build**

```bash
npx tsc --noEmit && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold puddles-admin Next.js 16 project with Monochrome v3"
git push -u origin main
```

---

### Task 2: Database migration — new tables

**Files:**
- Create: `supabase/migrations/20260507200000_puddles_admin_tables.sql` (in tackbird-mobile repo, applied to shared Supabase)

- [ ] **Step 1: Write migration file**

Create this file at `/Users/jesseparkkonen/tackbird-mobile/supabase/migrations/20260507200000_puddles_admin_tables.sql`:

```sql
-- Puddles Admin tables for platform-level management

-- 1. puddles_admins — access control for Puddles team
CREATE TABLE IF NOT EXISTS puddles_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'sales', 'support')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_puddles_admins_profile ON puddles_admins(profile_id);

ALTER TABLE puddles_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY puddles_admins_select ON puddles_admins FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY puddles_admins_insert ON puddles_admins FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role = 'superadmin'));

CREATE POLICY puddles_admins_update ON puddles_admins FOR UPDATE
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role = 'superadmin'));

CREATE POLICY puddles_admins_delete ON puddles_admins FOR DELETE
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role = 'superadmin'));

-- 2. pipeline_leads — sales pipeline
CREATE TABLE IF NOT EXISTS pipeline_leads (
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

CREATE POLICY pipeline_leads_select ON pipeline_leads FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY pipeline_leads_manage ON pipeline_leads FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin', 'sales')));

CREATE INDEX idx_pipeline_leads_stage ON pipeline_leads(stage);
CREATE INDEX idx_pipeline_leads_assigned ON pipeline_leads(assigned_to);

-- 3. pipeline_activities — CRM activity log
CREATE TABLE IF NOT EXISTS pipeline_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('note', 'email', 'call', 'meeting', 'stage_change')),
  description text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pipeline_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_activities_select ON pipeline_activities FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY pipeline_activities_manage ON pipeline_activities FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin', 'sales')));

CREATE INDEX idx_pipeline_activities_lead ON pipeline_activities(lead_id);

-- 4. billing_events — Stripe billing log
CREATE TABLE IF NOT EXISTS billing_events (
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

CREATE POLICY billing_events_select ON billing_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY billing_events_manage ON billing_events FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin')));

CREATE INDEX idx_billing_events_operator ON billing_events(operator_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);

-- 5. hub_partners — local business partnerships
CREATE TABLE IF NOT EXISTS hub_partners (
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

CREATE POLICY hub_partners_select ON hub_partners FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY hub_partners_manage ON hub_partners FOR ALL
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid() AND pa.role IN ('superadmin', 'admin', 'sales')));

CREATE INDEX idx_hub_partners_status ON hub_partners(status);

-- 6. platform_audit_log — admin action trail
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON platform_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE POLICY audit_log_insert ON platform_audit_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM puddles_admins pa WHERE pa.profile_id = auth.uid()));

CREATE INDEX idx_audit_log_actor ON platform_audit_log(actor_id);
CREATE INDEX idx_audit_log_target ON platform_audit_log(target_type, target_id);
CREATE INDEX idx_audit_log_created ON platform_audit_log(created_at DESC);

-- 7. Add Stripe columns to operators
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_stripe_customer
  ON operators(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 8. Seed: Jesse Parkkonen as superadmin
INSERT INTO puddles_admins (profile_id, role, created_by)
SELECT p.id, 'superadmin', p.id
FROM profiles p
WHERE p.email = 'parkkonen.jesse@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM puddles_admins WHERE profile_id = p.id)
ON CONFLICT DO NOTHING;

-- 9. Seed: sample pipeline leads
INSERT INTO pipeline_leads (company_name, business_id, contact_name, contact_email, stage, source, unit_count, estimated_mrr_cents, notes)
VALUES
  ('HOAS', '0116033-2', 'Matti Meikäläinen', 'matti@hoas.fi', 'lead', 'outbound', 8500, 4250000, 'Suurin opiskelija-asuntosäätiö. 8500 asuntoa.'),
  ('Kojamo (Lumo)', '0116336-2', 'Liisa Virtanen', 'liisa@kojamo.fi', 'contacted', 'event', 35000, 17500000, 'Suomen suurin yksityinen vuokranantaja. Pörssiyhtiö.'),
  ('SATO', '0201470-5', 'Antti Korhonen', 'antti@sato.fi', 'lead', 'outbound', 25000, 12500000, 'Pörssiyhtiö, 25000 asuntoa.'),
  ('TYS', '0200580-8', 'Sanna Lahtinen', 'sanna@tys.fi', 'demo_scheduled', 'referral', 9000, 4500000, 'Turun yliopiston tukisäätiö.'),
  ('Kodisto', '2941823-9', 'Jukka Peltonen', 'jukka@kodisto.fi', 'trial', 'website', 200, 100000, 'Uudiskohteita Helsingissä. Premium segmentti.')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply migration to Supabase**

Use the Supabase MCP `apply_migration` tool to run this migration against the shared Supabase instance (project ref: wfsghkseyyxkkalcqtzq).

- [ ] **Step 3: Verify tables created**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('puddles_admins', 'pipeline_leads', 'pipeline_activities', 'billing_events', 'hub_partners', 'platform_audit_log');
```

Expected: All 6 tables listed.

- [ ] **Step 4: Verify seed data**

```sql
SELECT pa.role, p.email FROM puddles_admins pa JOIN profiles p ON p.id = pa.profile_id;
```

Expected: Jesse Parkkonen as superadmin.

```sql
SELECT company_name, stage FROM pipeline_leads ORDER BY created_at;
```

Expected: 5 sample leads (HOAS, Kojamo, SATO, TYS, Kodisto).

- [ ] **Step 5: Commit migration**

```bash
cd /Users/jesseparkkonen/tackbird-mobile
git add supabase/migrations/20260507200000_puddles_admin_tables.sql
git commit -m "feat: add puddles-admin database tables (6 new + operators stripe columns)"
git push
```

---

### Task 3: Supabase client setup + auth middleware

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Write `src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Write `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — safe to ignore with middleware
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Write `src/lib/supabase/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 4: Write `src/middleware.ts`**

```ts
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|api/stripe-webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

Note: `api/stripe-webhook` is excluded from auth middleware since Stripe sends unsigned requests.

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts
git commit -m "feat: add Supabase client + auth middleware"
git push
```

---

### Task 4: Types, permissions, env helpers, and audit logger

**Files:**
- Create: `src/lib/types.ts`, `src/lib/permissions.ts`, `src/lib/env.ts`, `src/lib/audit.ts`

- [ ] **Step 1: Write `src/lib/types.ts`**

```ts
// Puddles Admin types

export type PuddlesAdminRole = "superadmin" | "admin" | "sales" | "support";

export interface PuddlesAdmin {
  id: string;
  profile_id: string;
  role: PuddlesAdminRole;
  created_at: string;
  created_by: string | null;
  profile?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export type PipelineStage =
  | "lead"
  | "contacted"
  | "demo_scheduled"
  | "demo_done"
  | "trial"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type LeadSource = "website" | "referral" | "outbound" | "event";

export interface PipelineLead {
  id: string;
  company_name: string;
  business_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  stage: PipelineStage;
  source: LeadSource | null;
  unit_count: number | null;
  estimated_mrr_cents: number | null;
  notes: string | null;
  assigned_to: string | null;
  operator_id: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
}

export type ActivityType = "note" | "email" | "call" | "meeting" | "stage_change";

export interface PipelineActivity {
  id: string;
  lead_id: string;
  activity_type: ActivityType;
  description: string | null;
  created_by: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string;
  };
}

export type BillingEventType =
  | "invoice_paid"
  | "invoice_failed"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled";

export interface BillingEvent {
  id: string;
  operator_id: string;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  event_type: BillingEventType;
  amount_cents: number | null;
  period_start: string | null;
  period_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type PartnerCategory = "cafe" | "gym" | "restaurant" | "service" | "shop" | "other";
export type PartnerStatus = "active" | "paused" | "ended";

export interface HubPartner {
  id: string;
  name: string;
  business_id: string | null;
  category: PartnerCategory | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  commission_pct: number;
  status: PartnerStatus;
  operator_ids: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string;
  };
}

// Re-export types from operator data model used in this app
export type SubscriptionTier = "pilot" | "active" | "enterprise";

export interface Operator {
  id: string;
  name: string;
  business_id: string;
  country: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  custom_domain: string | null;
  subscription_tier: SubscriptionTier;
  per_unit_price_cents: number;
  billing_email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  operator_id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string | null;
  building_id: string | null;
  unit_count: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Write `src/lib/permissions.ts`**

```ts
import type { PuddlesAdminRole } from "./types";

type Section =
  | "dashboard"
  | "operators"
  | "billing"
  | "pipeline"
  | "analytics"
  | "moderation"
  | "partners"
  | "residents"
  | "system"
  | "admin_management";

type Access = "full" | "view" | "none";

const PERMISSIONS: Record<Section, Record<PuddlesAdminRole, Access>> = {
  dashboard:        { superadmin: "full", admin: "full", sales: "full", support: "full" },
  operators:        { superadmin: "full", admin: "full", sales: "view", support: "view" },
  billing:          { superadmin: "full", admin: "full", sales: "none", support: "none" },
  pipeline:         { superadmin: "full", admin: "full", sales: "full", support: "none" },
  analytics:        { superadmin: "full", admin: "full", sales: "full", support: "view" },
  moderation:       { superadmin: "full", admin: "full", sales: "none", support: "full" },
  partners:         { superadmin: "full", admin: "full", sales: "full", support: "none" },
  residents:        { superadmin: "full", admin: "full", sales: "none", support: "full" },
  system:           { superadmin: "full", admin: "full", sales: "none", support: "none" },
  admin_management: { superadmin: "full", admin: "none", sales: "none", support: "none" },
};

export function hasAccess(role: PuddlesAdminRole, section: Section): boolean {
  return PERMISSIONS[section][role] !== "none";
}

export function canEdit(role: PuddlesAdminRole, section: Section): boolean {
  return PERMISSIONS[section][role] === "full";
}

export function getAccessibleSections(role: PuddlesAdminRole): Section[] {
  return (Object.keys(PERMISSIONS) as Section[]).filter(
    (section) => PERMISSIONS[section][role] !== "none"
  );
}
```

- [ ] **Step 3: Write `src/lib/env.ts`**

```ts
export type EnvKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "SENTRY_AUTH_TOKEN"
  | "SENTRY_ORG"
  | "SENTRY_PROJECT";

export function env(key: EnvKey): string | undefined {
  return process.env[key];
}

export function requireEnv(key: EnvKey): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export function isConfigured(...keys: EnvKey[]): boolean {
  return keys.every((k) => Boolean(process.env[k]));
}
```

- [ ] **Step 4: Write `src/lib/audit.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

export async function logAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();
  await (supabase.from("platform_audit_log") as any).insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata ?? {},
  });
}
```

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/permissions.ts src/lib/env.ts src/lib/audit.ts
git commit -m "feat: add types, permissions, env helpers, and audit logger"
git push
```

---

### Task 5: Login page + auth callback

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/auth/callback/route.ts`

- [ ] **Step 1: Write `src/app/(auth)/login/page.tsx`**

Replicate the operator-admin login page pattern but with "Puddles Admin" branding. Password-only login (no magic link needed for internal tool):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Mail, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight font-heading">
            Puddles Admin
          </CardTitle>
          <CardDescription>
            Puddles Oy — Platform Administration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Sähköposti
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="jesse@puddles.fi"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Salasana
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Salasana"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10"
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Kirjaudu sisään
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/app/(auth)/auth/callback/route.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: add login page + auth callback"
git push
```

---

### Task 6: Dashboard layout — sidebar, topbar, auth check

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/sidebar.tsx`, `src/components/topbar.tsx`, `src/components/no-access.tsx`

- [ ] **Step 1: Write `src/components/sidebar.tsx`**

Role-aware sidebar — only shows sections the user has access to:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Target,
  BarChart3,
  Shield,
  Handshake,
  Users,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasAccess } from "@/lib/permissions";
import type { PuddlesAdminRole } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/", label: "Yhteenveto", icon: LayoutDashboard, section: "dashboard" as const },
  { href: "/operators", label: "Operaattorit", icon: Building2, section: "operators" as const },
  { href: "/billing", label: "Laskutus", icon: CreditCard, section: "billing" as const },
  { href: "/pipeline", label: "Pipeline", icon: Target, section: "pipeline" as const },
  { href: "/analytics", label: "Analytiikka", icon: BarChart3, section: "analytics" as const },
  { href: "/moderation", label: "Moderointi", icon: Shield, section: "moderation" as const },
  { href: "/partners", label: "Hub-partnerit", icon: Handshake, section: "partners" as const },
  { href: "/residents", label: "Asukkaat", icon: Users, section: "residents" as const },
  { href: "/system", label: "Järjestelmä", icon: Activity, section: "system" as const },
];

export function Sidebar({ role }: { role: PuddlesAdminRole }) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => hasAccess(role, item.section));

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 border-r bg-card h-screen sticky top-0">
      <div className="flex items-center gap-2 px-6 h-16 border-b">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-heading font-bold text-sm">P</span>
        </div>
        <span className="font-heading font-bold text-lg tracking-tight">Puddles</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Write `src/components/topbar.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import type { PuddlesAdminRole } from "@/lib/types";

const ROLE_LABELS: Record<PuddlesAdminRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  sales: "Myynti",
  support: "Tuki",
};

export function Topbar({
  userEmail,
  role,
}: {
  userEmail: string;
  role: PuddlesAdminRole;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 border-b bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            className="lg:hidden inline-flex items-center justify-center rounded-md h-9 w-9 hover:bg-muted transition-colors"
            aria-label="Avaa valikko"
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64" onClick={() => setMobileOpen(false)}>
            <SheetTitle className="sr-only">Navigaatio</SheetTitle>
            <Sidebar role={role} />
          </SheetContent>
        </Sheet>
        <span className="font-heading font-semibold text-sm lg:text-base">
          Puddles Admin
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="hidden sm:inline-flex text-xs">
          {ROLE_LABELS[role]}
        </Badge>
        <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-48">
          {userEmail}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Kirjaudu ulos"
          aria-label="Kirjaudu ulos"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Write `src/components/no-access.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, LogOut } from "lucide-react";

export function NoAccess({ email }: { email: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="mx-auto mb-2">
            <ShieldAlert className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-xl">Ei oikeuksia</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Käyttäjällä <span className="font-medium text-foreground">{email}</span> ei
            ole Puddles-ylläpitäjän oikeuksia. Ota yhteyttä pääkäyttäjään.
          </p>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Kirjaudu ulos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/app/(dashboard)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { NoAccess } from "@/components/no-access";
import type { PuddlesAdminRole } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminRecord } = await supabase
    .from("puddles_admins")
    .select("id, role, profile_id")
    .eq("profile_id", user.id)
    .limit(1)
    .single();

  if (!adminRecord) {
    return <NoAccess email={user.email ?? ""} />;
  }

  const role = adminRecord.role as PuddlesAdminRole;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col">
        <Topbar userEmail={user.email ?? ""} role={role} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create placeholder dashboard page**

Write `src/app/(dashboard)/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Yhteenveto
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Puddles Oy — Platform Administration
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Test locally**

```bash
npm run dev
```

Open http://localhost:3000 — should redirect to /login. Log in with parkkonen.jesse@gmail.com / TackBird2026! — should show dashboard with sidebar.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/ src/components/sidebar.tsx src/components/topbar.tsx src/components/no-access.tsx
git commit -m "feat: add dashboard layout with auth check, sidebar, and topbar"
git push
```

---

### Task 7: Shared components — KPI card, empty state

**Files:**
- Create: `src/components/kpi-card.tsx`, `src/components/empty-state.tsx`

- [ ] **Step 1: Write `src/components/kpi-card.tsx`**

```tsx
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function KpiCard({
  label,
  value,
  subtitle,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? (
          <span className="text-muted-foreground">{icon}</span>
        ) : null}
      </div>
      <span
        className={cn(
          "font-heading text-3xl font-semibold tabular-nums",
          TONE_CLASSES[tone]
        )}
      >
        {value}
      </span>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/empty-state.tsx`**

```tsx
export function EmptyState({
  icon,
  headline,
  message,
  action,
}: {
  icon?: React.ReactNode;
  headline: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon ? (
        <div className="text-muted-foreground mb-2">{icon}</div>
      ) : null}
      <h3 className="font-heading text-base font-semibold">{headline}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/kpi-card.tsx src/components/empty-state.tsx
git commit -m "feat: add KPI card and empty state components"
git push
```

---

## Phase 2: Core Pages

### Task 8: Dashboard page — KPIs + activity feed

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Implement dashboard with real data**

Replace the placeholder with a full dashboard page that:
1. Queries `operators` count, `properties` SUM(unit_count), active `tenancies` count, `pipeline_leads` open count, content `flags` unresolved count
2. Shows 6 KPI cards in a responsive grid
3. Shows recent activity feed from `platform_audit_log` (last 20 entries)
4. All data fetching via Supabase server client in async Server Component
5. Use `Suspense` boundaries with skeleton loaders per section

The KPIs section should show:
- Operaattoreita: count from `operators`
- Asuntoja: sum from `properties.unit_count`
- Aktiivisia asukkaita: count from `tenancies` WHERE status = 'active'
- MRR: placeholder (show "—" until Stripe integration in Task 11)
- Avoimia liidejä: count from `pipeline_leads` WHERE stage NOT IN ('closed_won', 'closed_lost')
- Moderointijono: count from `content_flags` WHERE resolved_at IS NULL

The activity feed should query `platform_audit_log` joined with `profiles` for actor names, showing the 20 most recent entries with Finnish labels for action types.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Test locally**

```bash
npm run dev
```

Verify KPI cards render with real data from Supabase.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat: add dashboard page with KPIs and activity feed"
git push
```

---

### Task 9: Operators list page

**Files:**
- Create: `src/app/(dashboard)/operators/page.tsx`

- [ ] **Step 1: Implement operator list**

Server Component that:
1. Queries `operators` table with joined `properties` for unit_count sum and active tenancy count
2. Renders a shadcn Table with columns: Name, Y-tunnus, Tier (badge), Units, Residents, Status, Created
3. Search input filters by name or business_id (via query param)
4. Filter dropdown for tier (pilot/active/enterprise)
5. "Luo operaattori" button links to `/operators/new`
6. Each row links to `/operators/[id]`

Use the same table pattern as operator-admin's resident-table.tsx — shadcn Table with Badge for tier status.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/operators/
git commit -m "feat: add operator list page with search and filters"
git push
```

---

### Task 10: Operator detail page (tabbed)

**Files:**
- Create: `src/app/(dashboard)/operators/[id]/page.tsx`

- [ ] **Step 1: Implement operator detail**

Server Component with dynamic route `[id]`. Shows:
1. Header: operator name, logo placeholder, tier badge, business_id
2. Tabs component (shadcn Tabs) with 6 tabs:
   - **Yleistiedot** — Read-only fields (name, business_id, billing_email, domain, colors) with "Muokkaa" button that opens inline edit mode
   - **Kiinteistöt** — Table of `properties` for this operator (name, address, city, unit_count)
   - **Asukkaat** — Table of `tenancies` joined through units→properties WHERE operator_id matches
   - **Laskutus** — Placeholder until Stripe integration (show "Stripe-integraatio tulossa")
   - **Adminit** — Table of `operator_admins` for this operator (email, role, accepted_at)
   - **Asetukset** — JSON editor for operator settings (read-only initially)

Each tab fetches its own data server-side.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/operators/\[id\]/
git commit -m "feat: add operator detail page with tabbed view"
git push
```

---

### Task 11: Create operator page + server action

**Files:**
- Create: `src/app/(dashboard)/operators/new/page.tsx`
- Create: `src/actions/operators.ts`

- [ ] **Step 1: Write server action `src/actions/operators.ts`**

Server action that:
1. Validates form data with Zod (name required, business_id format, billing_email valid email, tier must be valid, per_unit_price positive)
2. Validates Y-tunnus via PRH API (call existing `validate-business` Edge Function)
3. Inserts into `operators` table
4. Logs to `platform_audit_log` via `logAction()`
5. Redirects to `/operators/[newId]`
6. Returns error messages for validation failures

- [ ] **Step 2: Write create operator form page**

Client Component with:
1. Form fields: name, business_id (Y-tunnus), billing_email, tier (Select), per_unit_price_cents (Input type number)
2. Optional: link from pipeline lead (if `?lead_id=xxx` query param, pre-fill from lead data)
3. Submit calls the server action
4. Loading state on submit button
5. Error display below relevant fields

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/operators/new/ src/actions/operators.ts
git commit -m "feat: add create operator form with Y-tunnus validation"
git push
```

---

### Task 12: Pipeline kanban board

**Files:**
- Create: `src/app/(dashboard)/pipeline/page.tsx`
- Create: `src/components/kanban-board.tsx`
- Create: `src/actions/pipeline.ts`

- [ ] **Step 1: Write server action `src/actions/pipeline.ts`**

Actions for:
1. `createLead(formData)` — Insert into `pipeline_leads`, log to audit
2. `updateLeadStage(leadId, newStage)` — Update stage + stage_changed_at, insert stage_change activity, log to audit
3. `addActivity(leadId, type, description)` — Insert into `pipeline_activities`, log to audit
4. `convertToOperator(leadId)` — Creates operator from lead data, updates lead with operator_id, sets stage to closed_won

- [ ] **Step 2: Write `src/components/kanban-board.tsx`**

Client Component using @dnd-kit/core for drag-and-drop:
1. 8 columns for each pipeline stage
2. Each column has a header with stage name (Finnish) and lead count
3. Lead cards show: company_name, contact_name, unit_count, estimated MRR (formatted as €), days in current stage
4. Drag a card to a new column → calls `updateLeadStage` server action
5. Click card → opens slide-over with lead detail (activity log, add activity form, "Konvertoi operaattoriksi" button)

Stage names in Finnish:
```ts
const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: "Liidi",
  contacted: "Kontaktoitu",
  demo_scheduled: "Demo sovittu",
  demo_done: "Demo tehty",
  trial: "Kokeilu",
  negotiation: "Neuvottelu",
  closed_won: "Voitettu",
  closed_lost: "Hävitty",
};
```

- [ ] **Step 3: Write pipeline page**

Server Component that:
1. Queries all `pipeline_leads` with assigned_to profile join
2. Passes leads to KanbanBoard client component
3. Shows pipeline metrics bar: total leads, conversion rate (closed_won / total), average deal size
4. "Lisää liidi" button opens a dialog with create lead form

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Test drag-and-drop locally**

```bash
npm run dev
```

Verify leads appear in correct columns, drag-and-drop moves them, stage changes persist.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/ src/components/kanban-board.tsx src/actions/pipeline.ts
git commit -m "feat: add pipeline kanban board with drag-and-drop"
git push
```

---

## Phase 3: Billing

### Task 13: Stripe client + billing page

**Files:**
- Create: `src/lib/stripe/client.ts`
- Create: `src/app/(dashboard)/billing/page.tsx`

- [ ] **Step 1: Write `src/lib/stripe/client.ts`**

```ts
import Stripe from "stripe";
import { requireEnv, isConfigured } from "@/lib/env";

export function isStripeConfigured(): boolean {
  return isConfigured("STRIPE_SECRET_KEY");
}

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2025-04-30.basil",
    });
  }
  return _stripe;
}
```

- [ ] **Step 2: Write billing page**

Server Component that:
1. If Stripe not configured → show EmptyState with setup instructions
2. Queries `operators` WHERE stripe_subscription_id IS NOT NULL for active subscriptions
3. Queries `billing_events` for recent invoice events
4. Calculates MRR: sum of all active subscriptions' monthly amounts
5. Shows:
   - KPI row: MRR (€), ARR (€), Active subscriptions, Churn rate
   - Subscriptions table: operator name, tier, units, per_unit_price, monthly amount, status, next invoice date
   - Invoices table: recent invoices from billing_events (operator, amount, status, date)
   - Failed invoices highlighted in red

For MRR calculation, sum each operator's `per_unit_price_cents * unit_count` across properties.

For invoice data from Stripe, use `getStripe().invoices.list()` with limit 20.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe/ src/app/\(dashboard\)/billing/
git commit -m "feat: add billing page with MRR/ARR metrics and invoice list"
git push
```

---

### Task 14: Stripe webhook handler

**Files:**
- Create: `src/app/api/stripe-webhook/route.ts`

- [ ] **Step 1: Write webhook handler**

Next.js Route Handler that:
1. Reads raw body from request
2. Verifies Stripe signature using `STRIPE_WEBHOOK_SECRET`
3. Handles events:
   - `invoice.paid` → insert billing_event with type 'invoice_paid'
   - `invoice.payment_failed` → insert billing_event with type 'invoice_failed'
   - `customer.subscription.created` → update operator's stripe_subscription_id, insert billing_event
   - `customer.subscription.updated` → insert billing_event
   - `customer.subscription.deleted` → clear operator's stripe_subscription_id, insert billing_event
4. Uses Supabase service role key (not anon) for database writes since webhook has no auth session
5. Returns 200 for handled events, 400 for signature failures

```ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));

function getAdminSupabase() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getAdminSupabase();

  switch (event.type) {
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from("billing_events").insert({
        operator_id: await findOperatorByStripeCustomer(supabase, invoice.customer as string),
        stripe_invoice_id: invoice.id,
        stripe_subscription_id: invoice.subscription as string,
        event_type: "invoice_paid",
        amount_cents: invoice.amount_paid,
        period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString().split("T")[0] : null,
        period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString().split("T")[0] : null,
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from("billing_events").insert({
        operator_id: await findOperatorByStripeCustomer(supabase, invoice.customer as string),
        stripe_invoice_id: invoice.id,
        stripe_subscription_id: invoice.subscription as string,
        event_type: "invoice_failed",
        amount_cents: invoice.amount_due,
      });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const operatorId = await findOperatorByStripeCustomer(supabase, sub.customer as string);

      if (event.type === "customer.subscription.deleted") {
        await supabase
          .from("operators")
          .update({ stripe_subscription_id: null })
          .eq("id", operatorId);
      }

      const eventType = event.type === "customer.subscription.created"
        ? "subscription_created"
        : event.type === "customer.subscription.updated"
        ? "subscription_updated"
        : "subscription_cancelled";

      await supabase.from("billing_events").insert({
        operator_id: operatorId,
        stripe_subscription_id: sub.id,
        event_type: eventType,
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function findOperatorByStripeCustomer(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("operators")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .limit(1)
    .single();
  return data?.id ?? null;
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stripe-webhook/
git commit -m "feat: add Stripe webhook handler for billing events"
git push
```

---

## Phase 4: Remaining Sections

### Task 15: Analytics page

**Files:**
- Create: `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Implement analytics page**

Server Component with Suspense boundaries:
1. **Platform metrics section:** Total users, WAU/MAU (from profiles + last activity), user growth chart (Recharts AreaChart showing new profiles per month for last 6 months)
2. **Activity section:** Posts, messages, events, maintenance requests per week (last 4 weeks as bar chart)
3. **Per-operator comparison table:** operator name, resident count, activity score (posts+messages per resident), sortable columns
4. Uses Supabase server client with aggregation queries

For growth chart data, query `profiles` grouped by `date_trunc('month', created_at)` for last 6 months.
For activity data, query each content table with `created_at >= now() - interval '4 weeks'` grouped by week.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/analytics/
git commit -m "feat: add analytics page with platform metrics and charts"
git push
```

---

### Task 16: Moderation page

**Files:**
- Create: `src/app/(dashboard)/moderation/page.tsx`
- Create: `src/actions/moderation.ts`

- [ ] **Step 1: Write server actions**

Actions for:
1. `resolveFlag(flagId, action)` — action: 'dismiss' | 'remove_content' | 'warn_user' | 'ban_user'. Updates flag, optionally removes post/message, optionally bans user profile. Logs to audit.
2. `unbanUser(profileId)` — Clears ban on profile. Logs to audit.
3. `bulkResolve(flagIds, action)` — Resolves multiple flags at once.

- [ ] **Step 2: Implement moderation page**

Two tabs:
1. **Jono** (Queue) — Table of unresolved content_flags joined with posts/profiles. Each row shows: content preview (truncated), reporter email, reason, timestamp. Action buttons: Hylkää, Poista sisältö, Varoita, Bannaa.
2. **Bannatut** (Banned) — Table of profiles WHERE is_banned = true. Shows: email, ban reason, banned date, banned_by. Unban button.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/moderation/ src/actions/moderation.ts
git commit -m "feat: add moderation page with flag queue and ban management"
git push
```

---

### Task 17: Hub partners pages

**Files:**
- Create: `src/app/(dashboard)/partners/page.tsx`
- Create: `src/app/(dashboard)/partners/[id]/page.tsx`
- Create: `src/app/(dashboard)/partners/new/page.tsx`
- Create: `src/actions/partners.ts`

- [ ] **Step 1: Write server actions**

Actions for:
1. `createPartner(formData)` — Validate with Zod, insert into hub_partners, log to audit
2. `updatePartner(id, formData)` — Update hub_partners, log to audit
3. `deletePartner(id)` — Soft delete (set status to 'ended'), log to audit

- [ ] **Step 2: Implement partner list page**

Table: name, category (badge), commission_%, status (badge), linked operators count, created_at. "Lisää partneri" button.

- [ ] **Step 3: Implement partner detail page**

Shows partner info with editable fields. Section showing which operators are linked (operator_ids array → join with operators table for names).

- [ ] **Step 4: Implement create partner form**

Form fields: name, business_id, category (select), contact_email, contact_phone, commission_pct, operator_ids (multi-select), notes.

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/partners/ src/actions/partners.ts
git commit -m "feat: add hub partners CRUD pages"
git push
```

---

### Task 18: Residents page

**Files:**
- Create: `src/app/(dashboard)/residents/page.tsx`
- Create: `src/actions/residents.ts`

- [ ] **Step 1: Write server actions**

Actions for:
1. `banResident(profileId, reason)` — Set is_banned, log to audit
2. `unbanResident(profileId)` — Clear is_banned, log to audit

- [ ] **Step 2: Implement residents page**

Cross-operator resident search:
1. Search input (searches profiles.email, profiles.full_name)
2. Table: name, email, operator name (via tenancy→unit→property→operator join), property name, unit number, tenancy status, joined date
3. Click row → slide-over with profile detail:
   - User info: name, email, phone, verification status, trust tier
   - Tenancy history: current + past tenancies
   - Activity summary: post count, message count, report count
   - Admin actions: ban/unban button

Tenancy statistics section at top: active, ended, pending counts grouped by operator.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/residents/ src/actions/residents.ts
git commit -m "feat: add cross-operator residents page with search"
git push
```

---

### Task 19: System health page

**Files:**
- Create: `src/app/(dashboard)/system/page.tsx`
- Create: `src/lib/sentry/client.ts`

- [ ] **Step 1: Write Sentry client**

Port from tackbird-dashboard:

```ts
import { isConfigured, requireEnv } from "@/lib/env";

export function isSentryConfigured(): boolean {
  return isConfigured("SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT");
}

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  count: string;
  userCount: number;
  level: string;
  permalink: string;
  lastSeen: string;
};

export async function getTopIssues(): Promise<SentryIssue[]> {
  const org = requireEnv("SENTRY_ORG");
  const project = requireEnv("SENTRY_PROJECT");
  const token = requireEnv("SENTRY_AUTH_TOKEN");
  const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?statsPeriod=7d&query=is:unresolved&sort=freq&limit=5`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sentry error: ${res.status}`);
  return (await res.json()) as SentryIssue[];
}
```

- [ ] **Step 2: Implement system health page**

Two sections with Suspense boundaries:

1. **Sentry-virheet** — If Sentry configured: table of top 5 unresolved errors (title, count, affected users, last seen, link to Sentry). If not: EmptyState with setup instructions.

2. **Supabase-terveys** — Query Supabase Management API or show static info:
   - Database project URL
   - Edge Function count (count files in supabase/functions/)
   - Last migration timestamp
   - Connection info link to Supabase dashboard

3. **Sovellus** — Mobile app info:
   - Current Expo SDK version (from package.json)
   - Link to EAS builds dashboard

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/system/ src/lib/sentry/
git commit -m "feat: add system health page with Sentry and Supabase monitoring"
git push
```

---

## Phase 5: Final Integration

### Task 20: Update dashboard with real MRR + complete all KPIs

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Update MRR calculation**

Replace the "—" MRR placeholder with real calculation:
1. Query operators WHERE stripe_subscription_id IS NOT NULL
2. For each, calculate monthly amount: per_unit_price_cents × total unit_count across properties
3. Sum all = MRR
4. Format as € with Finnish locale

Also update activity feed to include:
- Recent pipeline stage changes (from pipeline_activities WHERE activity_type = 'stage_change')
- Recent billing events (from billing_events)
- Recent content flags
- Recent operator creations

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat: complete dashboard with real MRR and full activity feed"
git push
```

---

### Task 21: Full build verification + deploy

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: All pages build successfully.

- [ ] **Step 3: Test all pages locally**

```bash
npm run dev
```

Verify each page loads without errors:
- `/` — Dashboard with KPIs
- `/operators` — Operator list
- `/operators/[id]` — Operator detail (use existing TackBird Demo operator)
- `/billing` — Billing overview (may show EmptyState if no Stripe keys)
- `/pipeline` — Kanban board with seed data (5 leads)
- `/analytics` — Platform metrics
- `/moderation` — Flag queue
- `/partners` — Partner list (empty initially)
- `/residents` — Resident search
- `/system` — System health

- [ ] **Step 4: Deploy to Vercel**

```bash
npx vercel --prod
```

Or connect the GitHub repo to Vercel and set environment variables.

- [ ] **Step 5: Set Vercel deployment protection**

In Vercel dashboard: Project → Settings → Deployment Protection → Enable password protection.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: puddles-admin v1.0 — complete platform administration panel"
git push
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1–7 | Foundation: repo, DB migration, auth, layout, shared components |
| 2 | 8–12 | Core pages: dashboard, operators CRUD, pipeline kanban |
| 3 | 13–14 | Billing: Stripe client, billing page, webhook handler |
| 4 | 15–19 | Remaining: analytics, moderation, partners, residents, system |
| 5 | 20–21 | Final: MRR integration, full verification, deploy |

**Total: 21 tasks across 5 phases.**

Each phase produces working, deployable software. Phase 1 gives you a running app with auth. Phase 2 adds the core business functionality. Phases 3-5 add specialized modules.
