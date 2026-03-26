# TackBird — Content Moderation Policy

**Version:** 1.0
**Date:** 26.3.2026
**Organization:** Puddles Oy (Y-tunnus: 3610705-3)
**Contact:** main.puddles@gmail.com

---

## 1. Overview

TackBird is a neighborhood marketplace and community app where users can post listings, offer services, send messages, participate in forums, and create groups. All user-generated content (UGC) is subject to this moderation policy.

## 2. Content Types Moderated

| Content Type | Where | Moderation Method |
|-------------|-------|-------------------|
| Post listings | Feed, post detail | Automated + manual |
| Post images | Feed, post detail | Manual (via reports) |
| Comments | Post detail | Automated + manual |
| Forum posts & replies | Forum | Automated + manual |
| Group posts & comments | Groups | Manual (via reports) |
| Messages | Private conversations | Manual (via reports) |
| User profiles | Profiles | Manual (via reports) |
| Events | Community events | Manual (via reports) |
| Advertisements | Business ads | Manual review before activation |

## 3. Automated Content Filtering

### 3.1 Pre-Publication Check (Client-Side)

Before a post is submitted, the app performs client-side checks:

- **External links blocked**: URLs (http/https) are rejected to prevent phishing
- **Off-platform messaging blocked**: References to WhatsApp, Telegram, Signal are rejected to keep conversations within TackBird's moderated environment
- **Minimum content length**: Title and description must meet minimum length requirements
- **Duplicate detection**: Same title within 1 hour from same user is blocked

### 3.2 Post-Publication Analysis (Server-Side)

After publication, a Supabase Edge Function (`moderate-content`) analyzes content using pattern matching:

**Spam Detection (score +20 per match):**
- External URLs
- Cryptocurrency/gambling references
- Pharmacy spam
- Repeated characters (>5 same character)
- "Free money" / "Click here" patterns

**Scam Detection (score +40 per match):**
- Advance payment requests
- Wire transfer instructions
- Western Union/MoneyGram references
- Lottery/winning scams
- Shipping fee scams

**Inappropriate Content (score +30 per match):**
- Threats of violence
- Hate speech markers
- Discriminatory language

### 3.3 Scoring and Actions

| Score | Action | Description |
|-------|--------|-------------|
| 0-39 | **Allow** | Content published normally |
| 40-69 | **Flag** | Content published but flagged for admin review |
| 70-100 | **Block** | Content automatically hidden (is_active=false) |

Flagged content is stored in the `content_flags` database table with:
- Flag type (spam, scam, inappropriate, duplicate, low_quality)
- Detailed match information
- Auto-hidden status
- Review status

## 4. User Reporting Mechanism

### 4.1 Report Availability

Users can report content via a **Flag icon** available on:
- ✅ Post detail screen (posts from other users)
- ✅ Forum posts (via ForumPostCard)
- ✅ Group posts (via GroupPostCard)
- ✅ Conversation header (report the other user)
- ✅ Public profiles (report user)
- ✅ Community events

### 4.2 Report Reasons

Users select from 6 predefined reasons:
1. **Spam** — Unwanted advertising or repetitive content
2. **Inappropriate** — Offensive, explicit, or disturbing content
3. **Harassment** — Targeted bullying, threats, or intimidation
4. **Scam** — Fraudulent listings or deceptive practices
5. **Fake** — Misleading information or fake identity
6. **Other** — With free-text description

### 4.3 Report Flow

1. User taps Flag icon → Report modal opens
2. User selects reason + optional description
3. Report submitted to `reports` database table
4. Reporter sees confirmation: "Report submitted. Our team will review within 24 hours."
5. Report appears in Admin panel for review

## 5. User Blocking

Users can block other users from their profile page:
- Blocked user's posts are hidden from the blocker's feed
- Blocked user cannot send messages to the blocker
- Blocking is reversible from Settings → Blocked Users
- Block list is private (other users cannot see who you've blocked)

## 6. Admin Moderation Panel

TackBird includes an admin panel (`/admin`) accessible only to users with `is_admin=true` in their profile. The panel has three sections:

### 6.1 Flags Tab
- Lists all content flags (automated + user reports)
- Shows: post title, flag type, details, date, auto-hidden status
- Actions: **Hide Post** (sets is_active=false), **Allow** (dismisses flag), **Ban User**

### 6.2 Users Tab
- Search users by name
- View: avatar, name, neighborhood, trust score, banned status
- Action: Ban/Unban toggle with confirmation

### 6.3 Stats Tab
- Total registered users
- Active users today
- Posts this week
- Bookings this week
- Unreviewed flags count

## 7. Enforcement Actions

| Action | When Applied | Reversible |
|--------|-------------|------------|
| **Content hidden** | Auto-moderation score ≥70 or admin action | Yes — admin can restore |
| **Content flagged** | Auto-moderation score 40-69 or user report | Yes — admin reviews |
| **User warned** | First offense, minor violation | N/A |
| **User banned** | Repeated violations, severe content | Yes — admin can unban |
| **Account deleted** | User request or extreme violations | No |

## 8. Trust System Integration

TackBird's three-tier trust system impacts content visibility:

| Trust Level | Restrictions |
|-------------|-------------|
| Tier 1 (Basic) | Standard posting, no marketplace transactions |
| Tier 2 (Verified) | Identity verified, can borrow/lend/sell services |
| Tier 3 (Trusted) | Full access, priority in feed, trusted badge |

Trust score is continuously calculated based on:
- Response rate (20%)
- Review score (25%)
- Cancellation rate (15%)
- Dispute rate (15%)
- Activity level (10%)
- Identity verification (15%)

**Trust can decrease** — if a user accumulates reports, cancellations, or disputes, their trust tier can drop, restricting marketplace access.

## 9. Response Times

| Report Type | Target Response Time |
|-------------|---------------------|
| Safety threat (violence, harm) | < 4 hours |
| Scam / fraud | < 12 hours |
| Spam | < 24 hours |
| Inappropriate content | < 24 hours |
| Other | < 48 hours |

## 10. Appeal Process

Users whose content is hidden or accounts are banned can appeal by:
1. Contacting support at main.puddles@gmail.com
2. Providing context for the moderated content
3. Appeal reviewed within 48 hours
4. User notified of decision

## 11. Data Retention

- Reports are retained for 12 months for pattern analysis
- Flagged content details retained for 6 months after resolution
- Banned user records retained indefinitely for safety

## 12. Updates

This policy is reviewed quarterly and updated as needed. Users are notified of significant changes via in-app notification.

---

*Last updated: 26.3.2026*
