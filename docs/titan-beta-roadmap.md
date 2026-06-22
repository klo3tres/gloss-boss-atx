# Titan Beta — Business Plan & Roadmap

Gloss Boss ATX is the laboratory. **Titan** is the product.

> Titan is not a CRM. Titan is the operating system that makes a mobile service business feel like it has ten extra employees.

---

## Brand split

| Brand | Role |
|-------|------|
| **Gloss Boss ATX** | Live detailing business — proves every workflow |
| **Titan** | Software company — sells what Gloss Boss proved |

**Logo direction (Titan):** Black field, geometric **T**, no robot/circuit clichés. Military-enterprise simplicity (Apple/Nike/Tesla energy).

---

## Titan Beta (now — Summer 2026)

Shipped inside Gloss Boss super admin (`/admin/super`):

1. **Titan Command Center** — morning briefing, revenue forecast, priority actions
2. **Titan Insights** — follow-ups, leads, estimates, exceptions, memory count
3. **Ask Titan** — natural-language search over real business data
4. **Titan Memory** — notes, messages, notifications, job events (institutional memory v0)
5. **Weather intelligence** — rain risk tied to operations
6. **Technician OS** — composite scorecards (revenue, upsell %, reviews, attendance, avg job time)
7. **Revenue Engine** — nightly leak scan (lapsed customers, open estimates, memberships, balances)
8. **Opportunity Engine** — booking rhythm prediction + auto-queue high-probability rebooks
9. **Reputation Engine** — VIP vs Risk customer tiers
10. **Titan Forecast** — projected month-end with confidence % and factor breakdown

Nightly cron: `/api/cron/titan-nightly` (6:00 UTC) scans leaks, queues opportunities, and syncs Lead Radar prospects from fleet inquiries.

### Titan Growth OS (Phases 11–15)

Shipped on `/admin/super` below intelligence panels:

11. **Lead Radar** — B2B prospect discovery, scoring, pipeline promotion. **Google Places API** scans apartments, dealerships, fleets, landscapers, HOAs, and more within 15 miles every morning.
12. **Outreach OS** — Type-specific call scripts, email, SMS; one-click contact execution
13. **Ad OS** — Channel spend vs attributed revenue (Facebook, Google, referral, etc.)
14. **Content Engine** — Top-performing content tracking + hook/caption/shot-list recommendations
15. **Command Layer** — Natural-language growth plans (`Get me 5 new customers`) → Approve → Execute

Migration: `000088_titan_growth_os.sql`, `000089_titan_places_discovery.sql`

### Titan Product Layer (identity + proof)

Shipped on `/admin/super`:

- **Titan Business DNA** — workspace settings (industry, radius, goals, hours) drive Lead Radar and briefing
- **Titan Branding** — Command Center™, Powered by Titan™ footer, Titan color system
- **Titan Timeline** — live activity feed (discoveries, follow-ups, outreach, plans)
- **Titan ROI** — attributable impact MTD (leads, rebooks, follow-ups, generated revenue)

Migration: `000090_titan_product_layer.sql`

---

| Week | Module | Outcome |
|------|--------|---------|
| 1 | **Places API Discovery** ✅ | Morning prospect radar |
| 2 | Territory Intelligence™ | Geo spend/convert insights |
| 3 | Market Map™ | Visual opportunity map |
| 4 | Acquisition Cost™ | CAC by channel |

**Titan Revenue Graph™** — every feature must answer: get customer, retain customer, or increase customer value.

---

## Pricing model (future SaaS)

| Plan | Price | Includes |
|------|-------|----------|
| **Titan Core** | $49/mo | Scheduling, CRM timeline, estimates, follow-ups |
| **Titan Pro** | $149/mo | + Exception inbox, financial closeout, Titan briefing |
| **Titan Elite** | $299/mo | + Multi-tech dispatch, fleet, API, priority support |

---

## Revenue scenarios (theoretical)

Assumptions: you hustle like you do now — beta users from your network, content, door knocks, detailing community.

| Year | Users | Avg plan | MRR | ARR |
|------|-------|----------|-----|-----|
| **2026 H2** | 5–10 beta | $0 (free) | $0–$500 | — |
| **2027** | 50 | $99 blended | **$4,950** | ~$59K |
| **2028** | 200 | $119 | **$23,800** | ~$286K |
| **2029** | 600 | $129 | **$77,400** | ~$929K |
| **2030** | 1,500 | $149 | **$223,500** | ~$2.7M |
| **2032** | 5,000 | $149 | **$745,000** | ~$8.9M |

At 5,000 users and strong retention, a 10–15× ARR multiple → **$90M–$130M** valuation range (not guaranteed — illustrates path).

**What moves the needle:** data moat (operations dataset), not more UI widgets.

---

## Execution timeline (with your hustle)

### This week
- [x] Titan Command Center on super admin
- [x] Ask Titan search (rule-based on live data)
- [x] Morning briefing + top 5 actions
- [ ] Run Gloss Boss on Titan daily — log what’s wrong

### Next 30 days
- Phase 6: Technician OS (route, required photos, timer)
- Titan Memory: customer preference tags (dog hair, water spots, VIP)
- Export anonymized ops patterns (internal only)

### Fall 2026
- 5–10 beta detailers (free, feedback-heavy)
- Landing page: titanops.com or similar
- Stripe billing for Titan (not Gloss Boss customers)

### 2027
- Public SaaS launch
- Pressure wash + mobile mechanic ICP expansion
- First hire: part-time dev or strong contractor

---

## Moat: Institutional Memory + Ops Dataset

Everyone will have AI by 2030. Nobody can copy:

- Years of **no-show**, **deposit**, **weather**, **upsell**, **review** patterns
- Cross-business benchmarks (anonymized): *"Businesses like yours charge 18% more"*

Build the dataset by running Gloss Boss on Gloss Boss.

---

## What NOT to build yet

- Full autonomous AI dispatcher
- AI voice agents calling prospects autonomously
- Generic dashboard cards
- "AI business advisor" chat with no data behind it

Finish workflows first. Titan executes through real outreach, follow-ups, and command plans — not fake autonomy.

---

## Shark Tank line (2032)

> **Titan is the first autonomous operating system for mobile service businesses. We don't help owners run their company — we help the company run itself.**

Competing with: receptionist, scheduler, dispatcher, follow-up rep, and parts of the back office — not Salesforce.

---

## Daily owner ritual

1. Open `/admin/super` — read Titan briefing
2. Execute top 3 actions (follow-ups, estimates, exceptions)
3. Close the day in Financial Closeout
4. Note one operational headache → Titan backlog

That's how Gloss Boss funds Titan, and Titan funds the billion-dollar vision.
