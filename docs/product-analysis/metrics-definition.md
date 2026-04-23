# TackBird — Metrics Definition

> Date: 2026-04-23 | Framework: HEART + Business + Neighborhood Health
> Data source: Supabase (67 tables) | Stage: Pre-launch
> Instrumentation: All metrics derivable from existing Supabase tables

---

## 1. North Star Metric

### **Successful Neighborhood Exchanges per Week**

> "The number of completed item exchanges (given, lent, returned, or service provided) between users in the same neighborhood per week."

**Why this metric:**
- Captures TackBird's core value: neighbors helping each other
- Requires both supply (someone posts) AND demand (someone responds) AND completion (exchange happens)
- Grows only when the marketplace is healthy — not gameable by posting alone
- Maps directly to user satisfaction and retention

**How to compute:**
```sql
SELECT
  DATE_TRUNC('week', updated_at) AS week,
  naapurusto,
  COUNT(*) AS exchanges
FROM posts
WHERE status IN ('given', 'lent', 'completed')
  AND updated_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC;
```

**Supporting metrics for rental exchanges:**
```sql
SELECT COUNT(*) FROM rental_bookings
WHERE status = 'returned'
  AND returned_at >= NOW() - INTERVAL '7 days';
```

**Target:**
- Launch: 10 exchanges/week across pilot neighborhoods
- 3 months: 50 exchanges/week
- 6 months: 200 exchanges/week
- 12 months: 1 000 exchanges/week

---

## 2. HEART Framework Metrics

### Happiness

| Metric | Definition | Data Source | Computation | Target |
|--------|-----------|-------------|-------------|--------|
| **Review sentiment** | Average star rating across all reviews | `reviews.rating` | `AVG(rating) WHERE created_at > interval` | >= 4.2/5.0 |
| **NPS (in-app survey)** | "How likely to recommend TackBird to a neighbor?" | Needs new table: `surveys` | Standard NPS formula | >= 40 |
| **Response satisfaction** | % of messages that receive a reply | `messages` | `COUNT(replies) / COUNT(first_messages)` | >= 70% |
| **Help request fulfillment** | % of "tarvitsen" posts that get resolved | `posts WHERE type='tarvitsen'` | `COUNT(status='completed') / COUNT(*)` | >= 40% |

**SQL: Review sentiment trend**
```sql
SELECT
  DATE_TRUNC('week', created_at) AS week,
  AVG(rating) AS avg_rating,
  COUNT(*) AS review_count
FROM reviews
GROUP BY 1
ORDER BY 1 DESC;
```

### Engagement

| Metric | Definition | Data Source | Computation | Target |
|--------|-----------|-------------|-------------|--------|
| **DAU/WAU ratio** | Daily active users / Weekly active users | `profiles.last_seen_at` | Count distinct users seen today / count distinct users seen this week | >= 40% |
| **Posts created/week** | New posts per week | `posts.created_at` | `COUNT(*) WHERE created_at > interval` | >= 50 (pilot) |
| **Messages sent/day** | Messages per day | `messages.created_at` | `COUNT(*) WHERE created_at > interval` | >= 100 (pilot) |
| **Events joined/week** | Event RSVPs per week | `event_attendees.created_at` | `COUNT(*) WHERE created_at > interval` | >= 20 (pilot) |
| **Actions per session** | Posts viewed + messages + likes + saves per session | `post_views`, `messages`, `post_likes`, `saved_posts` | Composite (needs session tracking) | >= 5 |
| **Feed scroll depth** | How far users scroll in feed | Needs client-side tracking | Scroll position / total content | >= 3 screens |
| **Save rate** | % of viewed posts that get saved | `saved_posts` / `post_views` | `COUNT(saves) / COUNT(views)` | >= 5% |
| **Comment rate** | Comments per post | `post_comments` | `AVG(comment_count)` from posts | >= 0.5 |

**SQL: DAU/WAU ratio**
```sql
WITH dau AS (
  SELECT COUNT(DISTINCT id) AS n FROM profiles
  WHERE last_seen_at >= NOW() - INTERVAL '1 day'
),
wau AS (
  SELECT COUNT(DISTINCT id) AS n FROM profiles
  WHERE last_seen_at >= NOW() - INTERVAL '7 days'
)
SELECT dau.n::float / NULLIF(wau.n, 0) AS dau_wau_ratio
FROM dau, wau;
```

### Adoption

| Metric | Definition | Data Source | Computation | Target |
|--------|-----------|-------------|-------------|--------|
| **New signups/week** | New user registrations | `profiles.created_at` | `COUNT(*) WHERE created_at > interval` | >= 30/week (pilot) |
| **Activation rate** | % of signups who complete first meaningful action within 7 days | `profiles` + `posts` + `messages` | Users who post OR message within 7 days of signup / total signups | >= 30% |
| **First-post rate** | % of users who create their first post | `posts` | Users with >= 1 post / total users | >= 15% |
| **Onboarding completion** | % completing onboarding checklist | `profiles.onboarding_checklist` | Count complete / total | >= 60% |
| **Feature adoption** | % of users using lending, events, forum, groups | Various tables | Per-feature user count / total users | Varies |
| **Invite conversion** | % of invites that result in signup | `profiles.invite_code`, `profiles.invited_by` | Signups with invited_by / invites sent | >= 20% |

**SQL: Activation rate (7-day)**
```sql
WITH new_users AS (
  SELECT id, created_at FROM profiles
  WHERE created_at >= NOW() - INTERVAL '30 days'
),
activated AS (
  SELECT DISTINCT nu.id FROM new_users nu
  LEFT JOIN posts p ON p.user_id = nu.id AND p.created_at <= nu.created_at + INTERVAL '7 days'
  LEFT JOIN messages m ON m.sender_id = nu.id AND m.created_at <= nu.created_at + INTERVAL '7 days'
  WHERE p.id IS NOT NULL OR m.id IS NOT NULL
)
SELECT
  COUNT(activated.id)::float / NULLIF(COUNT(new_users.id), 0) AS activation_rate
FROM new_users
LEFT JOIN activated ON new_users.id = activated.id;
```

### Retention

| Metric | Definition | Data Source | Computation | Target |
|--------|-----------|-------------|-------------|--------|
| **D1 retention** | % of users returning day after signup | `profiles.last_seen_at` | Users seen on day 1 / signups on day 0 | >= 40% |
| **D7 retention** | % returning within 7 days | Same | Seen within 7 days / signups | >= 25% |
| **D30 retention** | % returning within 30 days | Same | Seen within 30 days / signups | >= 15% |
| **Weekly active retention** | % of WAU who are WAU next week | `profiles.last_seen_at` | WAU(week N) ∩ WAU(week N+1) / WAU(week N) | >= 50% |
| **Churn rate** | % of WAU who don't return next 2 weeks | Same | Lost WAU / previous WAU | <= 30% |
| **Resurrection rate** | % of churned users who return | Same | Returning churned / total churned | >= 5% |

**SQL: D7 retention cohort**
```sql
WITH cohort AS (
  SELECT id, DATE_TRUNC('day', created_at) AS signup_day
  FROM profiles
  WHERE created_at >= NOW() - INTERVAL '60 days'
),
retained AS (
  SELECT c.id, c.signup_day
  FROM cohort c
  JOIN profiles p ON p.id = c.id
  WHERE p.last_seen_at >= c.signup_day + INTERVAL '7 days'
)
SELECT
  cohort.signup_day,
  COUNT(DISTINCT cohort.id) AS signups,
  COUNT(DISTINCT retained.id) AS retained_d7,
  COUNT(DISTINCT retained.id)::float / NULLIF(COUNT(DISTINCT cohort.id), 0) AS d7_rate
FROM cohort
LEFT JOIN retained ON cohort.id = retained.id
GROUP BY 1
ORDER BY 1 DESC;
```

### Task Success

| Metric | Definition | Data Source | Computation | Target |
|--------|-----------|-------------|-------------|--------|
| **Post completion rate** | % of posts that reach "completed/given" status | `posts.status` | Completed / total posted | >= 50% |
| **Lending success rate** | % of rentals completed without dispute | `rental_bookings` | Returned successfully / total bookings | >= 90% |
| **Message response time** | Median time to first reply | `messages` | Median(first_reply_at - first_message_at) | <= 4 hours |
| **Event show rate** | % of RSVPs who actually attend | `event_attendees` | Attended / joined (needs check-in) | >= 60% |
| **Search success rate** | % of searches that lead to a message or save | `search_history` + `messages` | Actions within 10min of search / searches | >= 15% |
| **Booking conversion** | % of post views (lainaa) that result in booking | `post_views` + `rental_bookings` | Bookings / views on lainaa posts | >= 5% |

---

## 3. Business Metrics

| Metric | Definition | Data Source | Target (12mo) |
|--------|-----------|-------------|---------------|
| **MRR** | Monthly recurring revenue (Pro subscriptions) | `payments WHERE type='subscription'` | 500€/mo |
| **ARPU** | Average revenue per user/month | Total revenue / MAU | 0.50€ |
| **LTV** | Lifetime value | ARPU × average lifespan | 12€ |
| **CAC** | Customer acquisition cost | Marketing spend / new signups | < 3€ |
| **LTV:CAC ratio** | Unit economics health | LTV / CAC | >= 3:1 |
| **GMV** | Gross merchandise value (lending + services) | `payments` | 5 000€/mo |
| **Take rate** | Platform fee as % of GMV | Revenue from fees / GMV | 10% |
| **Marketplace liquidity** | % of posts that get >= 1 message within 48h | `posts` + `messages` | >= 60% |
| **Boost ROAS** | Messages received per € spent on boost | `boost_purchases` + `messages` | >= 5 messages/€ |

---

## 4. Neighborhood Health Metrics

Unique to TackBird — measures the health of each neighborhood as a community.

| Metric | Definition | Data Source | Healthy Threshold |
|--------|-----------|-------------|-------------------|
| **Posts/week/neighborhood** | New content creation rate | `posts` + `profiles.naapurusto` | >= 10/week |
| **Active users/neighborhood** | WAU in each neighborhood | `profiles.last_seen_at` + `naapurusto` | >= 50 |
| **Response rate within neighborhood** | % of posts getting messages from same neighborhood | `posts` + `messages` + `profiles.naapurusto` | >= 50% |
| **Cross-neighborhood ratio** | Messages between different neighborhoods / total | `messages` + `profiles.naapurusto` | 10-30% (some but not too much) |
| **Trust score distribution** | % of users at each trust tier | `profiles` trust calculation | >= 20% at Tier 2+, >= 5% at Tier 3 |
| **Event density** | Events per neighborhood per month | `community_events` + `naapurusto` | >= 4/month |
| **Lending utilization** | Active lainaa listings / total lainaa listings | `posts WHERE type='lainaa'` | >= 30% actively being borrowed |
| **Neighborhood diversity** | Category mix entropy | `posts.type` per neighborhood | High entropy = healthy mix |
| **New member integration** | % of new users who receive a message within 7 days | `profiles` + `messages` | >= 40% |

**SQL: Neighborhood health dashboard**
```sql
SELECT
  p.naapurusto,
  COUNT(DISTINCT CASE WHEN pr.last_seen_at >= NOW() - INTERVAL '7 days' THEN pr.id END) AS wau,
  COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN p.id END) AS posts_this_week,
  COUNT(DISTINCT CASE WHEN e.event_date >= NOW() AND e.event_date <= NOW() + INTERVAL '30 days' THEN e.id END) AS upcoming_events,
  AVG(r.rating) AS avg_review_rating
FROM profiles pr
LEFT JOIN posts p ON p.user_id = pr.id
LEFT JOIN community_events e ON e.naapurusto = pr.naapurusto
LEFT JOIN reviews r ON r.reviewed_id = pr.id
GROUP BY pr.naapurusto
ORDER BY wau DESC;
```

---

## 5. Leading vs Lagging Indicators

| Leading Indicator | Predicts (Lagging) | Relationship |
|-------------------|-------------------|-------------|
| New signups/week | WAU growth | More signups → more WAU (with retention) |
| Activation rate (first action in 7d) | D30 retention | Users who activate early retain better |
| Messages sent/day | Successful exchanges/week | Messages → coordinated pickups → completed exchanges |
| Post creation rate | Marketplace liquidity | More posts → more supply → more successful searches |
| Event RSVPs | Community engagement score | RSVPs → attendance → follow connections → repeat usage |
| Review completion rate | Trust tier progression | More reviews → more Tier 2/3 users → more lending |
| Response time (median) | User satisfaction (NPS) | Fast responses → happy users → recommend to friends |
| Invite sends | Organic growth rate | Invites → new users (with conversion rate) |
| Saved searches created | Retention | Saved searches = intent to return |
| Boost purchases | MRR trajectory | Self-serve boosting predicts Pro subscription demand |

| Lagging Indicator | Signal |
|-------------------|--------|
| Monthly exchanges | Overall platform health |
| D30 retention | Product-market fit |
| NPS | Word-of-mouth potential |
| MRR | Business sustainability |
| Trust Tier 3 users as % | Community maturity |

---

## 6. Metric Instrumentation Plan

### Phase 1: Pre-Launch (use existing Supabase data)

| Metric | Source Table | Query Complexity | Dashboard |
|--------|------------|-----------------|-----------|
| Signups | `profiles.created_at` | Simple | Count by day/week |
| DAU/WAU | `profiles.last_seen_at` | Simple | Distinct count by interval |
| Posts created | `posts.created_at` | Simple | Count by category, neighborhood |
| Messages | `messages.created_at` | Simple | Count by day |
| Events joined | `event_attendees.created_at` | Simple | Count by event |
| Reviews | `reviews` | Simple | Avg rating, count |
| Payments | `payments` | Simple | Sum by type |

**Implementation:** Supabase Dashboard SQL editor + weekly manual export. Zero engineering needed.

### Phase 2: Early Growth (add analytics tooling)

| Tool | Purpose | Effort |
|------|---------|--------|
| **PostHog** (or Mixpanel) | Event tracking, funnels, retention cohorts | 2 pw to integrate |
| **Sentry** | Error tracking, crash reporting | 1 pw |
| **Custom Supabase view** | Neighborhood health dashboard | 1 pw |

Client-side events to track:
```typescript
// Key events to instrument
analytics.track('post_created', { type, neighborhood, hasImages })
analytics.track('message_sent', { isFirstMessage, isReply })
analytics.track('post_viewed', { type, source: 'feed|search|deeplink' })
analytics.track('event_joined', { category, neighborhood })
analytics.track('booking_created', { dailyFee, depositAmount })
analytics.track('search_performed', { query, resultsCount, hasFilters })
analytics.track('profile_viewed', { trustTier, isOwnProfile })
analytics.track('invite_sent', { channel: 'whatsapp|sms|link' })
```

### Phase 3: Scale (automated dashboards)

| Dashboard | Metrics | Tool |
|-----------|---------|------|
| **Executive** | North Star, MRR, WAU, retention | Metabase/Grafana |
| **Product** | Funnels, feature adoption, engagement | PostHog |
| **Neighborhood** | Per-neighborhood health scores | Custom Supabase view |
| **Trust & Safety** | Reports, moderation queue, content quality | Custom admin panel |

---

## 7. Counter-Metrics

Watch these to ensure you're not optimizing the wrong thing:

| If you optimize... | Watch this counter-metric | Why |
|--------------------|--------------------------|-----|
| Post volume | Post quality score (avg content quality) | More posts shouldn't mean worse posts |
| Message volume | Message response rate | More messages shouldn't mean more ignored messages |
| Signup volume | D7 activation rate | More signups shouldn't mean lower quality users |
| Event RSVPs | Event show rate | More RSVPs shouldn't mean more no-shows |
| Revenue (MRR) | Free-to-paid conversion rate | Revenue shouldn't come from squeezing existing users |
| Boost purchases | Organic post visibility | Boosts shouldn't bury non-boosted content |
| Trust tier promotions | Review authenticity (reciprocal review rate) | Fast tier climbing shouldn't come from fake reviews |
| Response time | Response quality (review ratings) | Fast replies shouldn't mean low-effort replies |
| Lending volume | Dispute rate | More lending shouldn't mean more problems |
| Cross-neighborhood activity | Within-neighborhood activity | City-wide shouldn't dilute local community |

---

## 8. Alert Thresholds

| Alert | Condition | Severity | Action |
|-------|----------|----------|--------|
| **Zero posts day** | No posts created in 24h in a pilot neighborhood | Critical | Seed content, check for bugs |
| **Retention cliff** | D7 retention drops below 15% | Critical | Investigate UX, survey churned users |
| **Response collapse** | Median response time > 48h | High | Push notification reminders, check notification delivery |
| **Review drought** | No reviews in 7 days | High | Trigger review prompts, check prompt delivery |
| **Payment failure spike** | > 10% of Stripe payments fail | High | Check Stripe status, investigate errors |
| **Trust stagnation** | < 5% of 30-day users reach Tier 2 | Medium | Simplify verification, lower barriers |
| **Neighborhood imbalance** | One neighborhood has 5x the posts of another pilot | Medium | Seed the lagging neighborhood |
| **Content quality drop** | Avg content quality score drops 20% | Medium | Review moderation rules, check spam |
