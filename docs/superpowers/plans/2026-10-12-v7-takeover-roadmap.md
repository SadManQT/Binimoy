# Lenden Prohori v7 Takeover Roadmap

**Spec:** `Lenden_Prohori_Master_Build_Specification_v7.md` (moves to `docs/MASTER_SPEC.md` in LP-001)
**Audited commit:** `b8244ae` on `main`, 12 October 2026
**Status of this document:** plan only. Nothing below is implemented or verified.

This is the top-level roadmap. Each work package gets its own detailed plan file, written just before it starts, because later packages depend on contracts that earlier ones freeze. The first one is `2026-10-12-lp-001-bootstrap.md`.

## 1. Verdict

The repository cannot be evolved into v7. It has to be rebuilt from LP-001, with the current code kept as read-only reference.

The reason is not code quality in general. Three of the spec's foundations are absent and cannot be retrofitted onto the current design:

1. **Stack (A2).** v7 requires TypeScript, Next.js, PostgreSQL with reviewed SQL migrations, and a separate worker. The repo is Python FastAPI, MongoDB, and Create React App.
2. **Transactions (D.3 to D.5).** Each deal is one MongoDB document. Every command reads it, checks it in Python, then calls `update_one` with no version check. There are no row locks, no idempotency keys, no outbox, and no worker. Two concurrent settlements can both pass their checks.
3. **Vault (D.7).** The vault is hand-written ECDH plus AES-GCM in the browser, and the server re-encrypts with its own Fernet key. v7 requires a maintained Matrix SDK and says not to implement a new cryptographic protocol.

## 2. Current state against v7

| Area | What exists | v7 requirement | Gap |
|---|---|---|---|
| Language and UI | Python backend, React 19 CRA frontend | TypeScript, Next.js (A2) | Replace |
| Database | MongoDB, one document per deal | PostgreSQL, SQL migrations, constraints (A2, D.3) | Replace |
| Repo layout | `backend/`, `frontend/` | `apps/web`, `apps/worker`, `packages/*`, `infra`, `evals` (A3) | Replace |
| Governance files | `PROJECT_PLAN.md`, `memory/PRD.md`, `test_result.md` | `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `TASKS.yaml`, ADRs, handoffs, requirements register (A3, A5, E1) | Missing |
| Money | Whole-BDT integers, single-entry list inside the deal document | Minor units, double-entry journal, reservations, conservation equation (D.4) | Replace |
| Commands | Plain REST bodies; client sends `my_role` | Envelope with `idempotencyKey` and `expectedAggregateVersion`; typed errors (A8) | Missing |
| Authorization paths | `ACCEPTED_RELEASE`, `MUTUAL_RESOLUTION`, `REVIEWED_RESOLUTION`, and `NO_DELIVERY_REFUND` listed as the fourth | Four paths including `OBJECTIVE_RELEASE`; no-delivery refund is separate (B9) | `OBJECTIVE_RELEASE` does not exist |
| Dispatch | Settlement is a synchronous document update | Outbox, linearization point, adapter operation states, reconciliation (D.5) | Missing |
| Reviewer access | Any user with global role `reviewer` or `admin` can open any deal | Scoped, expiring assignment per case; no self-appeal; second approver (D.2, D.6) | Violates D.2 |
| Seeded accounts | Admin and reviewer accounts with passwords in `backend/seed.py`, seeded on every startup | Never expose seeded privileged users outside local/test (A7, A12) | Violates A12 |
| Vault | Custom browser crypto plus server Fernet key | Matrix SDK, device verification, package manifest (D.7) | Replace |
| AI | Template strings keyed by deal status; no model adapter | Provider-neutral adapter with `AI_MODE=fixture` and live mode, citations, consent binding (B12, D.11) | Missing adapter, evaluation, and consent binding |
| Research | Seeded subjects and reports in MongoDB | `SearchProvider` adapter, fixture and live modes, snapshots, access-status classes (C7, C34, D.10) | Missing pipeline |
| URL fetching | `evidence.py` checks the first host for private addresses but follows redirects without rechecking | Revalidate DNS and every redirect, size and time limits (D.9) | Partial |
| Categories | Eleven categories as bilingual label lists | Executable templates with predicates, capability registry, 99 combinations (D.1) | Labels only |
| Tests | Two pytest files that call a hosted Emergent preview URL | Unit, real-PostgreSQL integration, Playwright with independent sessions (A11) | Not reproducible locally |
| Deployment | Emergent preview image | Containers for web and worker, PostgreSQL, object storage, vault service (A13) | Missing |

Existing documents overstate the state of the project. `memory/PRD.md` says "verified 33/33 backend + 16/16 frontend" and lists four authorization paths. Those tests ran against a remote preview, and the fourth path listed is not the one v7 defines. `frontend/public/progress.html` should be treated the same way. Under v7 invariant INV-16, every feature is currently **unverified**.

## 3. What to keep

| Keep | Where it goes |
|---|---|
| Bangla and English copy in `frontend/src/i18n.js` | `apps/web` message catalog (LP-014) |
| Visual direction in `design_guidelines.json` and the page layouts | Reference for `apps/web` screens |
| Category item wording in `backend/policy.py` | Starting text for `packages/templates` (LP-004, LP-021) |
| Scenario ideas in `backend/tests/*.py` | Rewritten as integration tests in the owning package |
| Fixture subjects and reports in `backend/seed.py` | `packages/fixtures`, without privileged accounts |

Everything else is reference only. LP-001 moves it to `legacy/` with `git mv` so history is preserved, and it is deleted once the replacement screen or rule is verified.

## 4. Decisions

Already settled by the spec, so not reopened:

- Rebuild as a pnpm TypeScript monorepo on a task branch; `main` stays untouched until LP-001 is verified.
- Payments, verifier, research, and AI default to mock or fixture modes.
- Target is D2 (full self-test application), then D3 (private staging). D5 real money is out of scope.

Needs the founder:

1. **Hosting.** The repo is wired to Emergent (`.emergent/`, an Emergent git identity in `.gitconfig`, tests pointing at an Emergent preview URL). The Emergent base image is FastAPI, React, and MongoDB, so the v7 stack will not run there. Local development needs only Docker. A staging host is needed by LP-015, not before.
2. **Runtime API keys.** Only needed when live research (LP-012) or live AI (LP-011) is switched on. Fixture mode needs none.
3. **Brand name** from Part F3. Not blocking; IDs do not change.

## 5. Sequence

Milestones follow A10 and E2 dependency order. Each row is one plan file and one or more task branches.

| Milestone | Packages | Ends when | Gate |
|---|---|---|---|
| M0 Foundation | LP-001 | A clean checkout installs, starts PostgreSQL, and serves a labeled empty fixture shell with a worker heartbeat | none |
| M1 Contracts and identity | LP-002, LP-003 | Illegal transitions and cross-user commands are rejected in tests; buyer, seller, and reviewer have separate sessions | none |
| M2 Vertical slice | LP-004, LP-005, LP-006, LP-007, LP-008, LP-009 | One synthetic category runs agreement, funding, delivery, inspection, accepted release, and no-delivery refund against real PostgreSQL | **D1** |
| M3 Review and AI | LP-010, LP-011 | All three service modes run; reviewed resolution and appeal work; AI outage leaves deterministic actions available | none |
| M4 Research | LP-012, LP-013 | Fixture research pipeline and community report lifecycle work end to end | none |
| M5 Hardening | LP-017, LP-018, LP-019, LP-020 | D.1 and D.3 to D.10 contracts pass with fault injection | none |
| M6 Coverage | LP-021, LP-022, LP-014 | Eleven categories, 99 combinations, B13 and V7 scenarios have executed results | **D2** |
| M7 Staging | LP-015 | Exact commit deployed privately with restore, rollback, and load evidence | **D3** |
| Later | LP-016 | FE-29 to FE-37 tracked individually | none |

LP-005, LP-006, LP-007, and LP-012 can run in parallel once M1 is merged (A10). LP-007 carries the highest technical risk because it depends on Matrix SDK and auth compatibility, so LP-001 includes a time-boxed compatibility spike and LP-003 records the result in ADR-003.

## 6. Rules for every package

- Read `AGENTS.md`, `STATUS.md`, `TASKS.yaml`, and the latest handoff before editing.
- One task, one branch, one handoff note in `docs/handoffs/`.
- A test that was not run is `NOT_RUN`, never `PASS`.
- No feature row in `docs/requirements.yaml` is deleted or demoted without a recorded founder decision.
- `legacy/` is never imported by new code.
