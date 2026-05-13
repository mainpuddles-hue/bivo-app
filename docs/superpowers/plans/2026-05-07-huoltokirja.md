# Huoltokirja (Maintenance Book) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement statutory maintenance book (huoltokirja) for TackBird platform — web (operator admin) + mobile (technician interface)

**Architecture:** Replace existing `maintenance_book` page (recurring schedules) with new `maintenance_tasks` system (ad-hoc task management). Operator admin gets list/detail/create pages with filters, reports, and comments. Mobile gets technician-facing screens behind role check. Both share the same 4 DB tables + RLS policies.

**Tech Stack:** Next.js 15 + Tailwind v4 + shadcn/ui (web), Expo SDK 54 + StyleSheet.create + Lucide React Native (mobile), Supabase (shared backend)

---

## File Structure

### Supabase (shared)
- `maintenance_tasks` — already created, needs RLS
- `maintenance_task_attachments` — already created, needs RLS
- `maintenance_task_comments` — already created, needs RLS
- `maintenance_task_history` — already created, needs RLS
- Storage bucket: `maintenance-attachments` — needs creation

### Operator Admin (`/Users/jesseparkkonen/tackbird-operator-admin`)
- Modify: `src/app/(dashboard)/maintenance-book/page.tsx` — Replace with new task-based list
- Modify: `src/app/actions/technical.ts` — Replace maintenance_book actions with maintenance_tasks
- Modify: `src/components/technical/maintenance-book-detail-sheet.tsx` — Replace with task detail
- Create: `src/components/technical/maintenance-task-filters.tsx` — Client-side filters
- Create: `src/components/technical/maintenance-task-comments.tsx` — Comments section in detail sheet

### Mobile (`/Users/jesseparkkonen/tackbird-mobile`)
- Create: `src/hooks/useMaintenanceTasks.ts` — Data fetching hook
- Create: `app/maintenance-tasks.tsx` — Task list screen
- Create: `app/maintenance-task/[id].tsx` — Task detail screen
- Create: `app/maintenance-task-create.tsx` — Quick create screen
- Modify: `app/(tabs)/profile.tsx` — Add "Huoltotehtävät" card (conditional on role)
- Modify: `src/lib/i18n/fi.json` — Add maintenance task translations
- Modify: `src/lib/i18n/en.json` — Add maintenance task translations
- Modify: `src/lib/i18n/sv.json` — Add maintenance task translations

---

## Task 1: Database — RLS Policies + Storage Bucket

**Files:**
- Supabase SQL (via MCP)

- [ ] **Step 1: Enable RLS on all 4 tables**

```sql
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_task_history ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Create RLS policies for maintenance_tasks**

```sql
-- SELECT: user must be in operator_admins for the task's operator
CREATE POLICY "maintenance_tasks_select" ON maintenance_tasks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM operator_admins oa
    WHERE oa.profile_id = auth.uid()
    AND oa.operator_id = maintenance_tasks.operator_id
  )
);

-- INSERT: owner/admin/manager/technician can create
CREATE POLICY "maintenance_tasks_insert" ON maintenance_tasks FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM operator_admins oa
    WHERE oa.profile_id = auth.uid()
    AND oa.operator_id = maintenance_tasks.operator_id
    AND oa.role IN ('owner', 'admin', 'manager', 'technician')
  )
);

-- UPDATE: owner/admin/manager can update any; technician can update own or assigned
CREATE POLICY "maintenance_tasks_update" ON maintenance_tasks FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM operator_admins oa
    WHERE oa.profile_id = auth.uid()
    AND oa.operator_id = maintenance_tasks.operator_id
    AND (
      oa.role IN ('owner', 'admin', 'manager')
      OR (oa.role = 'technician' AND (
        maintenance_tasks.created_by = auth.uid()
        OR maintenance_tasks.assigned_to = auth.uid()
      ))
    )
  )
);

-- DELETE: only owner/admin
CREATE POLICY "maintenance_tasks_delete" ON maintenance_tasks FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM operator_admins oa
    WHERE oa.profile_id = auth.uid()
    AND oa.operator_id = maintenance_tasks.operator_id
    AND oa.role IN ('owner', 'admin')
  )
);
```

- [ ] **Step 3: Create RLS policies for attachments, comments, history**

```sql
-- Attachments: same operator scope as tasks
CREATE POLICY "maintenance_task_attachments_select" ON maintenance_task_attachments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_attachments.task_id
  )
);

CREATE POLICY "maintenance_task_attachments_insert" ON maintenance_task_attachments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_attachments.task_id
  )
);

CREATE POLICY "maintenance_task_attachments_delete" ON maintenance_task_attachments FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_attachments.task_id
    AND oa.role IN ('owner', 'admin')
  )
);

-- Comments: same operator scope
CREATE POLICY "maintenance_task_comments_select" ON maintenance_task_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_comments.task_id
  )
);

CREATE POLICY "maintenance_task_comments_insert" ON maintenance_task_comments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_comments.task_id
  )
);

-- History: same operator scope, read-only for all
CREATE POLICY "maintenance_task_history_select" ON maintenance_task_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_history.task_id
  )
);

CREATE POLICY "maintenance_task_history_insert" ON maintenance_task_history FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM maintenance_tasks mt
    JOIN operator_admins oa ON oa.operator_id = mt.operator_id AND oa.profile_id = auth.uid()
    WHERE mt.id = maintenance_task_history.task_id
  )
);
```

- [ ] **Step 4: Create storage bucket**

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('maintenance-attachments', 'maintenance-attachments', false);

-- Storage policies
CREATE POLICY "maintenance_attachments_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'maintenance-attachments' AND auth.uid() IS NOT NULL
);

CREATE POLICY "maintenance_attachments_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'maintenance-attachments' AND auth.uid() IS NOT NULL
);

CREATE POLICY "maintenance_attachments_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'maintenance-attachments' AND auth.uid() IS NOT NULL
);
```

---

## Task 2: Operator Admin — Server Actions

**Files:**
- Modify: `/Users/jesseparkkonen/tackbird-operator-admin/src/app/actions/technical.ts`

Replace `createMaintenanceBookEntry`, `updateMaintenanceBookEntry`, `completeMaintenanceBookEntry` with:

- [ ] **Step 1: Write createMaintenanceTask action**

```typescript
export async function createMaintenanceTask(formData: FormData) {
  const supabase = await createClient();
  const operatorId = await getOperatorId();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const propertyId = formData.get("property_id") as string;
  const { data: prop } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("operator_id", operatorId)
    .single();
  if (!prop) throw new Error("Ei oikeuksia.");

  const estimatedCost = formData.get("estimated_cost_cents") as string;

  const { error } = await (supabase.from("maintenance_tasks") as any).insert({
    operator_id: operatorId,
    property_id: propertyId,
    title: (formData.get("title") as string).trim(),
    description: (formData.get("description") as string)?.trim() || null,
    category: formData.get("category") as string || "other",
    priority: formData.get("priority") as string || "normal",
    status: "open",
    created_by: user.id,
    assigned_to: (formData.get("assigned_to") as string) || null,
    estimated_cost_cents: estimatedCost ? parseInt(estimatedCost) : null,
  });

  if (error) throw new Error("Luonti epäonnistui: " + error.message);
  revalidatePath("/maintenance-book");
}
```

- [ ] **Step 2: Write updateMaintenanceTask action**

```typescript
export async function updateMaintenanceTask(formData: FormData) {
  const supabase = await createClient();
  const operatorId = await getOperatorId();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  const estimatedCost = formData.get("estimated_cost_cents") as string;
  const actualCost = formData.get("actual_cost_cents") as string;

  const update: Record<string, unknown> = {
    title: (formData.get("title") as string)?.trim(),
    description: (formData.get("description") as string)?.trim() || null,
    category: formData.get("category") as string,
    priority: formData.get("priority") as string,
    status,
    assigned_to: (formData.get("assigned_to") as string) || null,
    estimated_cost_cents: estimatedCost ? parseInt(estimatedCost) : null,
    actual_cost_cents: actualCost ? parseInt(actualCost) : null,
    updated_at: new Date().toISOString(),
  };

  if (status === "done") {
    update.completed_at = new Date().toISOString();
    update.completed_by = user.id;
  }

  const { error } = await (supabase.from("maintenance_tasks") as any)
    .update(update)
    .eq("id", id)
    .eq("operator_id", operatorId);

  if (error) throw new Error("Päivittäminen epäonnistui: " + error.message);

  // Log status change to history
  const oldStatus = formData.get("old_status") as string;
  if (oldStatus && oldStatus !== status) {
    await (supabase.from("maintenance_task_history") as any).insert({
      task_id: id,
      changed_by: user.id,
      field: "status",
      old_value: oldStatus,
      new_value: status,
    });
  }

  revalidatePath("/maintenance-book");
}
```

- [ ] **Step 3: Write addMaintenanceTaskComment action**

```typescript
export async function addMaintenanceTaskComment(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const operatorId = await getOperatorId();

  const taskId = formData.get("task_id") as string;
  const body = (formData.get("body") as string)?.trim();
  if (!body) throw new Error("Kommentti on pakollinen.");

  // Verify task belongs to operator
  const { data: task } = await (supabase.from("maintenance_tasks") as any)
    .select("id")
    .eq("id", taskId)
    .eq("operator_id", operatorId)
    .single();
  if (!task) throw new Error("Ei oikeuksia.");

  const { error } = await (supabase.from("maintenance_task_comments") as any).insert({
    task_id: taskId,
    author_id: user.id,
    body,
  });

  if (error) throw new Error("Kommentin lisääminen epäonnistui.");
  revalidatePath("/maintenance-book");
}
```

- [ ] **Step 4: Write deleteMaintenanceTask action**

```typescript
export async function deleteMaintenanceTask(formData: FormData) {
  const supabase = await createClient();
  const operatorId = await getOperatorId();

  const id = formData.get("id") as string;

  const { error } = await (supabase.from("maintenance_tasks") as any)
    .delete()
    .eq("id", id)
    .eq("operator_id", operatorId);

  if (error) throw new Error("Poistaminen epäonnistui: " + error.message);
  revalidatePath("/maintenance-book");
}
```

- [ ] **Step 5: Run `npx tsc --noEmit` in operator-admin**

Run: `cd /Users/jesseparkkonen/tackbird-operator-admin && npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 6: Commit and push**

```bash
cd /Users/jesseparkkonen/tackbird-operator-admin
git add src/app/actions/technical.ts
git commit -m "feat(huoltokirja): replace maintenance_book actions with maintenance_tasks CRUD"
git push
```

---

## Task 3: Operator Admin — Filters Component

**Files:**
- Create: `/Users/jesseparkkonen/tackbird-operator-admin/src/components/technical/maintenance-task-filters.tsx`

- [ ] **Step 1: Create filters component**

Client component with status, category, priority, property selects. Use URL search params (same pattern as `maintenance-filters.tsx`).

Status options: open, in_progress, done
Category options: hvac, electrical, yard, structural, fire_safety, cleaning, other
Priority options: low, normal, urgent

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 4: Operator Admin — List Page (Replace maintenance-book/page.tsx)

**Files:**
- Modify: `/Users/jesseparkkonen/tackbird-operator-admin/src/app/(dashboard)/maintenance-book/page.tsx`

- [ ] **Step 1: Rewrite page to query maintenance_tasks**

Replace the entire page. New features:
- Query from `maintenance_tasks` instead of `maintenance_book`
- SLA stats: open count, in_progress count, done this month
- Table columns: Tila, Otsikko, Kiinteistö, Kategoria, Prioriteetti, Vastuuhenkilö, Luotu
- Filters component (status, category, priority, property)
- "Luo tehtävä" button linking to inline form or separate section
- Selected item opens detail sheet
- Priority badges (color-coded)
- Fetch properties AND technicians for dropdowns

New configs:
```typescript
const STATUS_CONFIG = {
  open: { label: "Avoin", variant: "destructive" },
  in_progress: { label: "Käynnissä", variant: "default" },
  done: { label: "Tehty", variant: "secondary" },
};

const CATEGORY_LABELS = {
  hvac: "LVI", electrical: "Sähkö", yard: "Piha", structural: "Rakenne",
  fire_safety: "Paloturvallisuus", cleaning: "Siivous", other: "Muu",
};

const PRIORITY_CONFIG = {
  low: { label: "Matala", variant: "secondary" },
  normal: { label: "Normaali", variant: "default" },
  urgent: { label: "Kiireellinen", variant: "destructive" },
};
```

- [ ] **Step 2: Add inline create form at bottom of page**

Form with: title (required), property_id (select), category (select), priority (select), assigned_to (select from technicians), description (textarea), estimated_cost_cents (number input showing euros).

- [ ] **Step 3: Run tsc, commit, push**

---

## Task 5: Operator Admin — Detail Sheet (Replace maintenance-book-detail-sheet)

**Files:**
- Modify: `/Users/jesseparkkonen/tackbird-operator-admin/src/components/technical/maintenance-book-detail-sheet.tsx`

- [ ] **Step 1: Rewrite detail sheet for maintenance_tasks**

Sections:
1. Header: title, status badge, priority badge, category
2. Info grid: kiinteistö, vastuuhenkilö, luotu, arvioitu kulu, toteutunut kulu
3. Description section
4. Status update form (select + submit)
5. Quick action buttons: "Aloita työ" (open→in_progress), "Kuittaa tehdyksi" (→done)
6. Edit form: all fields editable
7. Comments section (fetch from maintenance_task_comments)
8. Comment add form
9. History section (fetch from maintenance_task_history)

- [ ] **Step 2: Fetch comments and history in the page.tsx server component and pass to sheet**

In page.tsx, when `params.selected` is set, also fetch:
```typescript
const { data: comments } = await (supabase.from("maintenance_task_comments") as any)
  .select("*, author:profiles(id, full_name)")
  .eq("task_id", params.selected)
  .order("created_at", { ascending: true });

const { data: history } = await (supabase.from("maintenance_task_history") as any)
  .select("*, changed_by_profile:profiles(id, full_name)")
  .eq("task_id", params.selected)
  .order("created_at", { ascending: false });
```

- [ ] **Step 3: Run tsc, commit, push**

---

## Task 6: Mobile — i18n Translations

**Files:**
- Modify: `/Users/jesseparkkonen/tackbird-mobile/src/lib/i18n/fi.json`
- Modify: `/Users/jesseparkkonen/tackbird-mobile/src/lib/i18n/en.json`
- Modify: `/Users/jesseparkkonen/tackbird-mobile/src/lib/i18n/sv.json`

- [ ] **Step 1: Add maintenance task translations to all 3 files**

Keys to add under `"maintenanceTask"`:
```json
{
  "maintenanceTask": {
    "title": "Huoltotehtävät" / "Maintenance Tasks" / "Underhållsuppgifter",
    "createTask": "Luo tehtävä" / "Create Task" / "Skapa uppgift",
    "taskTitle": "Otsikko" / "Title" / "Titel",
    "taskDescription": "Kuvaus" / "Description" / "Beskrivning",
    "category": "Kategoria" / "Category" / "Kategori",
    "priority": "Prioriteetti" / "Priority" / "Prioritet",
    "status": "Tila" / "Status" / "Status",
    "assignedTo": "Vastuuhenkilö" / "Assigned To" / "Tilldelad",
    "estimatedCost": "Arvioitu kulu" / "Estimated Cost" / "Beräknad kostnad",
    "actualCost": "Toteutunut kulu" / "Actual Cost" / "Verklig kostnad",
    "startWork": "Aloita työ" / "Start Work" / "Starta arbete",
    "markDone": "Kuittaa tehdyksi" / "Mark Done" / "Markera klar",
    "addComment": "Lisää kommentti" / "Add Comment" / "Lägg till kommentar",
    "addPhoto": "Lisää kuva" / "Add Photo" / "Lägg till foto",
    "noTasks": "Ei tehtäviä" / "No tasks" / "Inga uppgifter",
    "open": "Avoin" / "Open" / "Öppen",
    "inProgress": "Käynnissä" / "In Progress" / "Pågående",
    "done": "Tehty" / "Done" / "Klar",
    "low": "Matala" / "Low" / "Låg",
    "normal": "Normaali" / "Normal" / "Normal",
    "urgent": "Kiireellinen" / "Urgent" / "Brådskande",
    "hvac": "LVI" / "HVAC" / "VVS",
    "electrical": "Sähkö" / "Electrical" / "El",
    "yard": "Piha" / "Yard" / "Gård",
    "structural": "Rakenne" / "Structural" / "Konstruktion",
    "fireSafety": "Paloturvallisuus" / "Fire Safety" / "Brandsäkerhet",
    "cleaning": "Siivous" / "Cleaning" / "Städning",
    "other": "Muu" / "Other" / "Övrigt",
    "property": "Kiinteistö" / "Property" / "Fastighet",
    "filterAll": "Kaikki" / "All" / "Alla",
    "taskCount": "{{count}} tehtävää" / "{{count}} tasks" / "{{count}} uppgifter"
  }
}
```

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 7: Mobile — useMaintenanceTasks Hook

**Files:**
- Create: `/Users/jesseparkkonen/tackbird-mobile/src/hooks/useMaintenanceTasks.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useSupabase } from '@/hooks/useSupabase'
import { getCachedUserId } from '@/lib/authCache'

export interface MaintenanceTask {
  id: string
  operator_id: string
  property_id: string
  title: string
  description: string | null
  category: string
  priority: string
  status: string
  created_by: string
  assigned_to: string | null
  estimated_cost_cents: number | null
  actual_cost_cents: number | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
  property?: { id: string; name: string }
}

export function useMaintenanceTasks(statusFilter?: string) {
  const supabase = useSupabase()
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const userId = await getCachedUserId(supabase)
      if (!userId || !mountedRef.current) return

      let query = (supabase.from('maintenance_tasks') as any)
        .select('*, property:properties(id, name)')
        .order('created_at', { ascending: false })

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query
      if (!mountedRef.current) return
      if (error) throw error
      setTasks((data ?? []) as MaintenanceTask[])
    } catch (err) {
      if (__DEV__) console.log('[useMaintenanceTasks] error:', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [supabase, statusFilter])

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    fetchTasks()
    return () => { mountedRef.current = false }
  }, [fetchTasks]))

  return { tasks, loading, refetch: fetchTasks }
}

export function useOperatorRole() {
  const supabase = useSupabase()
  const [role, setRole] = useState<string | null>(null)
  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    ;(async () => {
      try {
        const userId = await getCachedUserId(supabase)
        if (!userId || !mountedRef.current) return
        const { data } = await (supabase.from('operator_admins') as any)
          .select('role, operator_id')
          .eq('profile_id', userId)
          .limit(1)
          .maybeSingle()
        if (!mountedRef.current) return
        setRole(data?.role ?? null)
        setOperatorId(data?.operator_id ?? null)
      } catch {
        // not an operator admin
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    })()
    return () => { mountedRef.current = false }
  }, [supabase]))

  return { role, operatorId, loading, isTechnician: role === 'technician' || role === 'manager' || role === 'admin' || role === 'owner' }
}
```

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 8: Mobile — Task List Screen

**Files:**
- Create: `/Users/jesseparkkonen/tackbird-mobile/app/maintenance-tasks.tsx`

- [ ] **Step 1: Create task list screen**

Features:
- Header with title "Huoltotehtävät" and "+" create button
- Status filter pills: Kaikki, Avoin, Käynnissä, Tehty
- FlatList of tasks with: status badge, title, property name, category, priority, date
- Pull-to-refresh
- Empty state with "Ei tehtäviä" message
- Navigate to detail on press
- Navigate to create on "+" press

Use patterns from existing screens: StyleSheet.create, useTheme, useI18n, PressableOpacity, Lucide icons.

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 9: Mobile — Task Detail Screen

**Files:**
- Create: `/Users/jesseparkkonen/tackbird-mobile/app/maintenance-task/[id].tsx`

- [ ] **Step 1: Create task detail screen**

Features:
- Header with back button and title
- Status badge + priority badge
- Info sections: property, category, assigned to, costs
- Description section
- Action buttons: "Aloita työ" (open→in_progress), "Kuittaa tehdyksi" (in_progress→done)
- Camera button for adding photos
- Actual cost input field
- Comments list (fetch from maintenance_task_comments)
- Comment input field
- Photo gallery (attachments)
- Status change logs status to maintenance_task_history

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 10: Mobile — Quick Create Screen

**Files:**
- Create: `/Users/jesseparkkonen/tackbird-mobile/app/maintenance-task-create.tsx`

- [ ] **Step 1: Create quick create screen**

Features:
- Header "Luo tehtävä" with back button
- Form fields: title (required), description (optional), property (picker), category (picker), priority (picker), photo (camera button)
- Submit button with loading state
- On success: navigate back to task list
- Upload image to maintenance-attachments bucket, create attachment record

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 11: Mobile — Profile Section for Technicians

**Files:**
- Modify: `/Users/jesseparkkonen/tackbird-mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Add "Huoltotehtävät" card to profile**

After the existing profile sections, add a conditional card:
- Only visible if user has operator_admins role (technician/manager/admin/owner)
- Shows: icon (Wrench), title "Huoltotehtävät", chevron, badge with open task count
- On press: navigate to `/maintenance-tasks`
- Use useOperatorRole() hook for role check

- [ ] **Step 2: Run tsc, commit, push**

---

## Task 12: Final Verification

- [ ] **Step 1: Run tsc --noEmit in both repos**

```bash
cd /Users/jesseparkkonen/tackbird-operator-admin && npx tsc --noEmit
cd /Users/jesseparkkonen/tackbird-mobile && npx tsc --noEmit
```

- [ ] **Step 2: Verify all commits pushed**

```bash
cd /Users/jesseparkkonen/tackbird-operator-admin && git log --oneline -5
cd /Users/jesseparkkonen/tackbird-mobile && git log --oneline -5
```
