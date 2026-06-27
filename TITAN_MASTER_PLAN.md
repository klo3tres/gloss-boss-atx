# Titan Master Plan

## Mission

Titan is an **AI Business Operator** for Gloss Boss ATX. Its job is to generate revenue opportunities, help convert them, track outcomes, and learn what works.

Titan is **not a CRM**. The Gloss Boss app includes CRM features (customers, appointments, payments), but Titan’s identity is revenue operations — not contact storage.

## Gloss Boss as first customer / lab

Gloss Boss ATX is Titan’s first live deployment. Every module is built against real detailing workflows: warm leads, canceled rebooks, apartment detail days, fleet outreach, review follow-ups, and manual social lead capture.

## Phase 1 — Lead Radar & Revenue Hunt (current)

- **Lead Radar** (`/admin/titan/lead-radar`): Manual-assisted capture from Facebook, Nextdoor, Reddit, referrals, Google Places (when configured). Keyword classification, reply templates, convert to Opportunity Board.
- **Revenue Hunt Today** (`/admin/titan`): Top 5 ranked actions from the Opportunity Board.
- **Opportunity Board** (`/admin/titan/opportunities`): Warm leads, rebooks, B2B prospects, CRM-derived opportunities. Copy message, mark outcomes, schedule follow-ups.

Works in **manual mode** without Twilio, Meta, or Resend.

## Phase 2 — Conversion & Follow-Up

- Outcome logging on every touch (contacted, booked, lost).
- Follow-up scheduling with cadence defaults.
- SMS/email send when integrations are connected (optional enhancement).

## Phase 3 — Business Memory

- Aggregate win/loss patterns by source type, intent, and message variant.
- Surface “what worked last month” in Titan Today.
- Tie closed jobs and payments back to Titan-sourced opportunities.

## Phase 4 — Optimization

- Score ranking improvements from historical conversion rates.
- Territory and seasonality adjustments.
- Experiment tracking (A/B outreach, geo tests).

## Phase 5 — Autonomy

- Daily mission generation from live pipeline + calendar gaps.
- Proactive follow-up suggestions (human approval before send).
- Nightly sync of CRM signals into Lead Radar and Opportunity Board.

## Future frontier

- Owner lineage: multi-location / multi-brand operators running Titan instances.
- Holographic business presence: consistent brand voice across channels.
- AI councils: specialized agents (acquisition, retention, partnerships) coordinated by Titan.
- Market intelligence: compliant public-signal monitoring + competitive positioning.

## Migrations

| Migration | Purpose |
|-----------|---------|
| `000100_titan_revenue_opportunities.sql` | Opportunity Engine v1 fields + events |
| `000101_titan_lead_radar.sql` | Lead Radar items + events |

## Env vars (optional enhancements)

| Variable | Used for |
|----------|----------|
| `GOOGLE_PLACES_API_KEY` | Lead Radar Google Places scan, review sync |
| `BUSINESS_LAT` / `BUSINESS_LNG` | Places search center |
| `NEXT_PUBLIC_APP_URL` | Should match Vercel production host (www) |

Domain redirects (`glossbossatx.com` ↔ `www`) are configured in **Vercel Domains only** — not in app middleware.
