# TackBird — State Machine Specifications

> Framework: wondelai/state-machine
> Date: 2026-04-23 | Scope: 5 critical UI flows modeled as finite state machines

---

## 1. Post Lifecycle State Machine

The complete lifecycle of a post from creation to completion.

```
                    ┌───────────────────────────────────────┐
                    │                                       │
                    ▼                                       │
┌─────────┐   ┌─────────┐   ┌───────────┐   ┌──────────┐ │ ┌────────────┐
│ drafting │──▶│ creating │──▶│  active    │──▶│ reserved │─┼▶│ completed  │
└─────────┘   └─────────┘   └───────────┘   └──────────┘ │ └────────────┘
    │              │              │  │             │       │       │
    │              │              │  │             │       │       ▼
    │              ▼              │  ▼             ▼       │ ┌────────────┐
    │         ┌─────────┐        │ ┌──────────┐ ┌───────┐ │ │  reviewed   │
    │         │  error   │        │ │ reported │ │expired│ │ └────────────┘
    │         └─────────┘        │ └──────────┘ └───────┘ │
    │                            ▼                        │
    │                       ┌──────────┐                  │
    │                       │  closed   │─────────────────┘
    │                       └──────────┘
    ▼
┌─────────┐
│discarded│
└─────────┘
```

### States

| State | UI Representation | Entry Actions |
|-------|------------------|---------------|
| `drafting` | Create form with unsaved data | Auto-save to AsyncStorage |
| `creating` | Form disabled, spinner on submit button | Upload images, submit to Supabase |
| `active` | Green "Aktiivinen" badge, appears in feed | Notify neighborhood |
| `reserved` | Yellow "Varattu" badge, still visible but marked | Notify poster, pause new messages |
| `completed` | Gray "Valmis" badge, hidden from feed | Prompt both parties for review |
| `closed` | "Suljettu" banner, visible but not actionable | Remove from active feed |
| `expired` | "Vanhentunut" label, archived | Auto-hide from feed |
| `reported` | Hidden from public, under moderation | Notify admin |
| `reviewed` | Final state after both reviews complete | Update trust scores |
| `error` | Error message with retry button | Log error, preserve form data |
| `discarded` | Nothing — draft deleted | Clear AsyncStorage draft |

### Transitions

| From | Event | To | Guard | Action |
|------|-------|----|-------|--------|
| `drafting` | SUBMIT | `creating` | All required fields filled | Disable form, start upload |
| `drafting` | DISCARD | `discarded` | — | Clear draft from storage |
| `creating` | UPLOAD_SUCCESS | `active` | — | Show success toast, navigate to post |
| `creating` | UPLOAD_FAIL | `error` | — | Show error, re-enable form |
| `error` | RETRY | `creating` | — | Re-attempt submission |
| `active` | MARK_RESERVED | `reserved` | Owner only | Update status, notify |
| `active` | MARK_CLOSED | `closed` | Owner only | Show confirmation dialog |
| `active` | EXPIRE | `expired` | expires_at passed | Auto-transition (cron) |
| `active` | REPORT | `reported` | Any user, max 1 per user | Queue for moderation |
| `reserved` | MARK_COMPLETED | `completed` | Owner only | Prompt for review |
| `reserved` | REACTIVATE | `active` | Owner only | Remove reservation |
| `completed` | BOTH_REVIEWED | `reviewed` | Both parties reviewed | Update trust scores |
| `closed` | REOPEN | `active` | Owner only | Return to feed |

### Impossible States (Prevented)

- `creating` AND `active` simultaneously
- `completed` without going through `active`
- `reviewed` without both parties having submitted reviews
- `expired` post receiving new messages

---

## 2. Lending Booking State Machine

The rental booking flow from inquiry to return.

```
┌──────────┐   ┌───────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐
│ browsing  │──▶│ inquiring │──▶│  booking  │──▶│  paying   │──▶│ confirmed│
└──────────┘   └───────────┘   └───────────┘   └──────────┘   └──────────┘
                    │                                │               │
                    ▼                                ▼               ▼
               ┌──────────┐                    ┌──────────┐   ┌──────────┐
               │ declined │                    │pay_failed│   │ picked_up│
               └──────────┘                    └──────────┘   └──────────┘
                                                                    │
                                                              ┌─────┴─────┐
                                                              ▼           ▼
                                                        ┌──────────┐ ┌─────────┐
                                                        │ returned │ │ overdue │
                                                        └──────────┘ └─────────┘
                                                              │           │
                                                              ▼           ▼
                                                        ┌──────────┐ ┌─────────┐
                                                        │ reviewed  │ │disputed │
                                                        └──────────┘ └─────────┘
```

### States

| State | UI | Actions |
|-------|-----|---------|
| `browsing` | Post detail, "Varaa" button visible | — |
| `inquiring` | Message thread opened, dates discussed | Create conversation if needed |
| `booking` | Date picker + price summary modal | Calculate total (days × fee + deposit) |
| `paying` | Stripe checkout loading | Create Stripe session |
| `pay_failed` | Error message with retry | Log error, preserve booking intent |
| `confirmed` | "Varaus vahvistettu" screen, booking details | Send confirmation email, create booking record |
| `picked_up` | "Noudettu" status in bookings | Record pickup timestamp |
| `returned` | "Palautettu" status, deposit release pending | Trigger deposit refund |
| `overdue` | "Myöhässä" warning, penalty info | Send reminder notifications (24h grace) |
| `reviewed` | Both reviews completed | Release deposit, update trust |
| `declined` | "Hylätty" — lender declined | Notify borrower |
| `disputed` | "Riita-asia" — dispute opened | Freeze deposit, notify admin |

### Key Guards

| Transition | Guard |
|-----------|-------|
| `browsing` → `booking` | User is logged in AND trust tier ≥ 1 |
| `booking` → `paying` | Dates valid AND item available AND deposit within range |
| `paying` → `confirmed` | Stripe payment successful |
| `confirmed` → `picked_up` | Lender confirms handover |
| `picked_up` → `returned` | Borrower returns AND lender confirms condition |
| `picked_up` → `overdue` | Return date + 24h grace passed |
| `overdue` after 7 days | → Auto-forfeit deposit |

---

## 3. Authentication State Machine

```
┌────────────┐   ┌──────────────┐   ┌─────────────┐
│ logged_out │──▶│authenticating│──▶│  logged_in   │
└────────────┘   └──────────────┘   └─────────────┘
      ▲               │                    │
      │               ▼                    │
      │          ┌──────────┐              │
      │          │auth_error│              │
      │          └──────────┘              │
      │               │                    │
      │               ▼                    ▼
      │          ┌──────────┐       ┌──────────────┐
      │          │  locked  │       │ logging_out  │
      │          └──────────┘       └──────────────┘
      │               │                    │
      └───────────────┴────────────────────┘
```

| State | UI | Entry Actions |
|-------|-----|---------------|
| `logged_out` | Login/register screen | Check for cached session token |
| `authenticating` | Button disabled, spinner | Supabase auth call |
| `auth_error` | Error message, form re-enabled | Map error to Finnish, increment attempts |
| `locked` | Timer countdown, form disabled | Start 15-min timer, save to AsyncStorage |
| `logged_in` | Tab navigator, full app | Store session, track login event |
| `logging_out` | Brief spinner | Clear session, clear AsyncStorage |

| Transition | Guard |
|-----------|-------|
| `logged_out` → `authenticating` | Email valid format, password ≥ 6 chars |
| `auth_error` → `locked` | loginAttempts ≥ 5 |
| `locked` → `logged_out` | 15 minutes elapsed |
| `logged_in` → `logging_out` | User taps logout OR session expired |

---

## 4. Message Conversation State Machine

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│  empty   │──▶│ composing│──▶│ sending  │
└──────────┘   └──────────┘   └──────────┘
                    ▲               │
                    │          ┌────┴─────┐
                    │          ▼          ▼
                    │    ┌──────────┐ ┌──────────┐
                    └────│  active  │ │send_error│
                         └──────────┘ └──────────┘
                              │
                         ┌────┴────┐
                         ▼         ▼
                    ┌─────────┐ ┌──────────┐
                    │archived │ │ blocked  │
                    └─────────┘ └──────────┘
```

| State | UI |
|-------|-----|
| `empty` | "Aloita keskustelu" prompt, empty thread |
| `composing` | Text input focused, keyboard visible, optional image attachment |
| `sending` | Send button disabled, spinner in message bubble |
| `active` | Message list with realtime updates, typing indicator |
| `send_error` | Failed message with retry icon |
| `archived` | Moved to archived tab, accessible but not in main list |
| `blocked` | Cannot send messages, "Estetty" banner |

---

## 5. Event Participation State Machine

```
┌───────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ discovered│──▶│  joined  │──▶│ attending│──▶│ attended │
└───────────┘   └──────────┘   └──────────┘   └──────────┘
                     │                              │
                     ▼                              ▼
                ┌──────────┐                  ┌──────────┐
                │  left    │                  │ reviewed  │
                └──────────┘                  └──────────┘
```

| State | UI | Actions |
|-------|-----|---------|
| `discovered` | Event card in feed/events tab, "Liity" button | — |
| `joined` | "Osallistut" badge, added to participant list | Increment participant_count, add to calendar |
| `left` | Back to "Liity" button | Decrement participant_count |
| `attending` | Event is today/now, chat enabled | Enable group chat, show location |
| `attended` | Event passed, in history | Prompt for feedback |
| `reviewed` | Review completed | Update organizer trust |

| Guard | Condition |
|-------|-----------|
| `discovered` → `joined` | User logged in AND participants < max_participants (or no limit) |
| `joined` → `attending` | event_date is today |
| `attending` → `attended` | event_end_date passed |

---

## Implementation Notes

### How to Use These State Machines

1. **As specifications** — Each screen should check its current state and render accordingly
2. **As test cases** — Every transition is a test scenario; every guard is an edge case
3. **As documentation** — New developers understand flow without reading all the code
4. **For impossible state prevention** — If a state combination isn't in the machine, it shouldn't be possible in the UI

### Recommended Pattern (React)

```typescript
type PostState = 'drafting' | 'creating' | 'active' | 'reserved' | 'completed' | 'closed' | 'expired' | 'error'

// Each state maps to a UI variant
function PostStatusBadge({ state }: { state: PostState }) {
  const config = {
    active: { label: 'Aktiivinen', color: colors.success },
    reserved: { label: 'Varattu', color: colors.warning },
    completed: { label: 'Valmis', color: colors.muted },
    closed: { label: 'Suljettu', color: colors.muted },
    expired: { label: 'Vanhentunut', color: colors.muted },
  }
  // ...
}
```
