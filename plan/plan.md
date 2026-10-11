# Lenden Prohori — Build Plan (Phase 1)

An AI-monitored workspace where a buyer and seller agree terms, hold money safely (simulated), deliver, inspect and settle fairly — paired with a public research space to look up and report on people and businesses before dealing with them.
This plan turns the v7 Master Specification into a focused, working first version plus a live HTML tracker that shows every planned feature and whether it is done.

## Who it's for
- **Buyers** who pay for a product or service and want proof before money is released.
- **Sellers** who deliver and want protection from false denial of delivery.
- **Reviewers / moderators** who step in when buyer and seller disagree, or who moderate public reports.
- **Researchers** — anyone wanting to check a person's or business's track record (positive, negative and resolved reports) before a deal.

## Core features and experience
Phase 1 delivers a working slice of **both** sides of the product, as requested.

**A. Transaction workspace (one deal category to start)**
- Create a deal, invite the other party, and both explicitly accept the same immutable terms before any money moves.
- Choose a service mode up front: AI-first with human fallback, human-assisted from the start, or AI-only self-test. The screen honestly shows whether a human is actually available.
- Mock funding only — money is simulated, nothing real is charged. A clear ledger tracks every unit.
- A **deal room** carries the whole conversation, with a visible "messages are AI-monitored" notice and message version history.
- A **completion map** lists the agreed items; each is marked PASS / FAIL / UNKNOWN. A cosmetic percentage never releases money.
- Settlement paths: release to seller, refund to buyer, or a mutually agreed split — each requiring the correct party's consent.
- Open a dispute, attach evidence, and send the case to a reviewer who records a reasoned outcome; an unresolved case is allowed and labeled honestly.
- A **custom, domain-trained assistant** (built around this product's own categories, inspection checklists and resolution policy — not a general chatbot) guides the parties and explains outcomes. All money and permission decisions are made by fixed policy rules, never by the assistant.

**B. Research & reporting**
- Search a subject (person or business) and see reports grouped as positive, negative, neutral and resolution, each with an evidence link/snapshot.
- A subject profile with a timeline where an original complaint and its later resolution stay linked (no double-counting).
- Compare two subjects on coverage and recency — without any overall "trust score" or guilt label.
- A community report editor with private drafts, a publication preview the author approves, a moderation queue, and a seller's right to respond, correct or appeal.

**C. Progress tracker (the HTML file you asked for)**
- A single standalone HTML page listing the whole plan and every feature (the spec's FE-01…FE-37 and the build work packages), each with a completion mark.
- Features are grouped by module and phase, show status (done / in progress / planned / deferred), and the page updates as work lands so progress is easy to see at a glance.

## User flow
1. A visitor signs in (Google or email + password) and lands on a bilingual home with two clear paths: **Research** and **My Deals**.
2. **Research path:** search a subject → read grouped reports and open evidence → optionally write and submit a report that enters the moderation queue.
3. **Deal path:** create a deal and invite the counterparty → both accept the same terms and pick a service mode → buyer mock-funds → seller delivers items → buyer inspects each item on the completion map → settle (release / refund / split) or open a dispute.
4. **Dispute:** either party opens a case with evidence → a reviewer reviews within scope and records an outcome, or the case stays openly unresolved.
5. A receipt reconstructs the agreement, evidence and allocation at the exact versions involved, without exposing secrets.

## UI/UX feel
- Bilingual Bangla ⇄ English toggle available anywhere; account IDs, provider names and numbers are preserved exactly (never transliterated), amounts shown in BDT.
- Calm, trustworthy and evidence-forward: every claim and outcome links to the record behind it; proposed (assistant) items look clearly different from committed facts.
- Honest states everywhere — loading, empty, error, permission-denied, pending and "unknown" are shown plainly and never faked as success.
- Mobile-friendly and accessible (clear focus, readable at zoom, keyboard and screen-reader friendly on the core journeys).

## Implementation phases

**Phase 1 — built now (MVP)**
- Sign-in with both Google and email/password, with buyer, seller and reviewer roles.
- Transaction workspace for one deal category: agreement + dual consent, three service modes, mock funding with an integer-money ledger, deal room with monitoring notice and message history, completion map, release/refund/split settlement, disputes with evidence, and basic human review.
- Research & reporting slice: subject search, grouped report results with evidence, subject profile timeline, two-subject compare, and a community report editor with moderation and seller response.
- Custom domain assistant for deal guidance and outcome explanations, with all financial/permission rules in policy code.
- Bilingual toggle and the live HTML progress tracker.
- Progress/context files kept current so the state of the build is always visible.

**Phase 2 — later**
- The full eleven-category catalog with every mandatory inspection item and the four authorization paths.
- Secret delivery vault with device/key handling, richer monitored-room evidence versioning, milestones and partial settlement, appeals sequencing, watchlist/update digests, and advanced research follow-up.
- Live external research providers and operational hardening (health checks, backups/restore, rollback, load and incident controls) toward a private staging release.

**Phase 3 — future**
- Real-money launch track (actual payment/custody, legal, identity/abuse, refund and support requirements) — kept fully separate and disabled until then.
- Native mobile apps, optional guided screen sessions, and additional categories and provider integrations.

## Assumptions
- **Phase 1 covers both modules** (transaction core and research/reporting) as working slices, since all focus options were selected; depth in each is limited and the full catalog is deferred to Phase 2.
- **"Custom trained" AI** is interpreted as a custom, domain-specific assistant built around this product's own categories, checklists and resolution policy (rules plus templated guidance) — not a newly trained neural network and not a general third-party chatbot. It needs no AI key, and financial/permission decisions stay in deterministic policy code. (This is the main point worth confirming.)
- **Both sign-in methods** (Google and email/password) are supported; email/password includes a seeded admin/reviewer account for testing.
- **Bilingual toggle** (Bangla ⇄ English) is available throughout; English and Bangla text are both provided for Phase 1 screens.
- **Payments are simulated only** (mock) in every phase before the Phase 3 real-money track; nothing real is ever charged in Phase 1.
- One representative deal category is used in Phase 1; the eleven-category catalog, secret vault, milestones, native apps and live research providers are deferred.
- The working name **"Lenden Prohori"** is kept; no final brand name is selected.
- Money is handled as whole units with a conserved ledger; disputes may end in a release, refund, agreed split, reviewed outcome, or an explicitly unresolved state.
