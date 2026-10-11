# Lenden Prohori (লেনদেন প্রহরী) — Project Plan

An AI-monitored workspace where a buyer and seller agree terms, hold money safely (simulated),
deliver, inspect and settle fairly — paired with a public research space to look up and report on
people and businesses before dealing with them.

Working name: **Lenden Prohori**. Source of truth: `Lenden_Prohori_Master_Build_Specification_v7.md`.

## Modules
- **A. Transaction workspace** — deal agreement + dual consent, 3 service modes, mock integer-money
  ledger (BDT), AI-monitored deal room with message versions, completion map (PASS/FAIL/UNKNOWN),
  settlement (release / refund / split), disputes + human review, receipts.
- **B. Research & reporting** — subject search, grouped reports (positive/negative/neutral/resolution)
  with evidence, subject timeline linking complaint↔resolution, two-subject compare (no trust score),
  community report editor with drafts/moderation/seller response.
- **C. Progress tracker** — standalone HTML (`frontend/public/progress.html`) listing the whole plan,
  every feature FE-01…FE-37 and the LP work packages, each with a completion mark.

## Phases
- **Phase 1 (built now, MVP):** both modules as working slices + bilingual toggle + progress tracker.
- **Phase 2 (later):** full 11-category catalog with all mandatory items + 4 authorization paths,
  secret delivery vault, milestones/partial settlement, appeals sequencing, watchlist, live research
  providers, ops hardening.
- **Phase 3 (future):** real-money launch track (kept fully disabled until then), native apps.

## Key principles (non-negotiable)
- Money is whole-unit integers in BDT with a conserved double-entry-style ledger; a cosmetic
  completion percentage NEVER releases money.
- All money & permission decisions live in deterministic `policy.py`; the custom assistant only
  proposes guidance / explains outcomes and never moves money.
- "Custom trained" AI = a domain-specific rule+template assistant built around this product's own
  categories, checklists and resolution policy — not a general chatbot, needs no AI key.
- Honest states everywhere (loading / empty / error / permission-denied / pending / unknown).
- Bilingual Bangla ⇄ English anywhere; account IDs, provider names and numbers never transliterated.
- Payments are simulated (mock) in every phase before Phase 3.

## Tech
- Backend: FastAPI + MongoDB (motor). Files: `auth.py`, `policy.py`, `assistant.py`, `deals.py`,
  `research.py`, `seed.py`, `server.py`, `db.py`.
- Frontend: React 19 + Tailwind + shadcn/ui. Bilingual via `i18n.js`.
- Auth: Email/password (bcrypt + JWT) AND Emergent Google OAuth, one shared `users` collection.
