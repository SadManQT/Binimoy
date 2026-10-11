# Progress Log — Lenden Prohori

Format: date — what landed. Newest first. The live feature matrix is `frontend/public/progress.html`.

## 2026-06 — Phase 1 MVP scaffold
- Backend: dual auth (email/password JWT + Emergent Google OAuth) sharing one `users` collection.
- Backend: deal lifecycle (create/invite → dual terms consent → mock fund → deliver → inspect →
  settle [release/split/reviewed] → dispute → receipt), integer BDT ledger with conservation.
- Backend: research (subjects, grouped reports, timeline with complaint↔resolution linking,
  two-subject compare without trust score, community report editor + moderation + seller response).
- Backend: rule-based domain assistant (guidance / checklist / explain), all money in `policy.py`.
- Seed: platform accounts (admin/reviewer/buyer/seller), demo subjects+reports, one demo deal.
- Docs: PROJECT_PLAN.md, AI_CONTEXT.md, this log, standalone progress.html tracker.
- Frontend: bilingual shell, auth, home, research, subject profile, compare, report editor,
  moderation, deals list, deal room.
