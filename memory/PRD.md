# PRD — Lenden Prohori (লেনদেন প্রহরী)

## Original problem statement
Plan the whole project, create all context/AI/progress files, build the pipeline, then build it. Produce an
HTML file listing the project plan & every feature with a completion mark. Source of truth: the uploaded
`Lenden_Prohori_Master_Build_Specification_v7.md`.

## What it is
An AI-monitored escrow workspace (buyer + seller agree immutable terms, mock-fund a conserved integer BDT
ledger, deliver, inspect a completion map, settle release/refund/split or dispute to a human reviewer) PLUS a
public research/reporting module (search subjects, grouped positive/negative/neutral/resolution reports with
evidence, subject timeline linking complaint↔resolution, two-subject compare with NO trust score, community
report editor with drafts/moderation/seller response). Bilingual Bangla⇄English. Money is simulated in Phase 1.

## Architecture
- **Backend** FastAPI + MongoDB (motor): `db.py`, `auth.py` (dual auth: email/password JWT + Emergent Google
  OAuth, one shared `users` collection), `policy.py` (deterministic money/permission + 11-category catalog),
  `assistant.py` (rule-based bilingual domain assistant, read-only), `deals.py`, `research.py`, `seed.py`,
  `server.py`. All routes `/api`-prefixed. UUID string ids (no ObjectId leakage).
- **Frontend** React 19 + Tailwind + shadcn/ui. `i18n.js` (bilingual), `context/AuthContext`, `components/Layout`,
  `components/AuthCallback`, `components/StatusBits`, pages: Landing, Login, Home, Research, SubjectProfile,
  Compare, ReportEditor, Moderation, Deals, DealRoom.
- **Tracker** standalone `frontend/public/progress.html` (FE-01…FE-37 + LP-001…LP-022 with live status marks).

## User personas
- Buyer, Seller (per-deal roles), Reviewer (dispute review + report moderation), Admin, Researcher (any user).

## Core requirements (static)
- Dual consent on immutable terms before money moves; integer conserved ledger; cosmetic % never releases money.
- Four authorization paths (accepted / mutual / reviewed / no-delivery refund); unresolved state allowed & honest.
- Research with evidence links, complaint↔resolution linking, compare without trust score.
- Bilingual everywhere; IDs/amounts never transliterated. Honest states. Money simulated pre-Phase-3.
- All money/permission decisions in deterministic policy code; assistant only proposes/explains.

## Implemented (2026-06, Phase 1 MVP) — verified 33/33 backend + 16/16 frontend
- Email/password + Google auth; roles; seeded accounts; protected routes.
- Deal lifecycle: create/invite → dual terms consent → mock fund → deliver → inspect (PASS/FAIL/UNKNOWN) →
  settle (release / mutual split / reviewed) → dispute + reviewer workbench (resolve/unresolved) → receipt.
- AI-monitored deal room with message version history + consent + monitoring notice.
- Research: subjects + search, profile timeline w/ resolution linking, two-subject compare (no trust score),
  community report editor (draft → approved preview → submit → moderation → publish), seller response/appeal.
- Rule-based bilingual assistant (guidance / explain / checklist). Standalone HTML progress tracker.

## Backlog (prioritized)
- **P1:** Evidence drawer snapshots (FE-04), subject identity merge rules (FE-01), notices/timers/deadlines
  (FE-23), appeal sequencing (FE-22), withdrawal of reports, richer research filters.
- **P2:** Secret Delivery Vault + device/key (FE-15), milestones/partial settlement (FE-20), full 11-category
  mandatory-item depth & 99 combos (FE-11), live research providers Tavily/Exa (FE-02/03), watchlist/digests
  (FE-30), Scenario Lab + quality workbench (FE-25/26), ops/restore/rollback (FE-28).
- **P3:** Real-money track (payments/custody/legal/identity) kept disabled; native apps; guided screen sessions.

## Next tasks
1. Evidence snapshot drawer + source access-status detail (FE-04).
2. Notices/timers so challenge windows cannot silently start/shorten (FE-23).
3. Deepen one category's mandatory items + authorization objective-release path (FE-11/FE-19).
