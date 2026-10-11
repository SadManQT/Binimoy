# AI_CONTEXT — The Lenden Prohori custom assistant & policy

This product's "AI" is intentionally a **custom, domain-trained assistant**, not a general LLM
chatbot and not a trained neural network. It is built entirely around THIS product's own domain:
its deal categories, its inspection checklists and its resolution policy.

## Two cleanly separated layers

### 1. `policy.py` — deterministic decisions (the only thing that can touch money/permissions)
- `CATEGORIES` — the eleven-category catalog (CAT-01…CAT-11) with bilingual inspection items.
- `build_completion_items(category)` — committed checklist for a deal.
- `held_amount(ledger)` — conserved integer-money hold = FUND − RELEASE − REFUND.
- `completion_summary(items)` — counts + a cosmetic percent (explicitly labeled "never releases money").
- `SERVICE_MODES`, `SETTLEMENT_PATHS`, `can_open_dispute(...)`.
All financial authorization happens in `deals.py` endpoints by calling this policy — never the assistant.

### 2. `assistant.py` — proposes & explains (read-only, marked `ai_suggested=True`)
- `guidance_for(deal)` — templated, bilingual next-step guidance keyed by deal status.
- `suggest_checklist(category)` — proposes inspection items (author must commit them).
- `explain_outcome(deal)` — plain-language, bilingual explanation of the current/settlement state.

The UI renders everything from `assistant.py` with the distinct "AI Suggested / AI প্রস্তাবিত" visual
language (dashed border, tinted background) so proposals never look like committed facts.

## Why no AI key
Because all guidance is template-driven and all decisions are deterministic policy code, Phase 1
needs no external AI provider. Phase 2's live research providers (Tavily/Exa) and any model-based
research summarization are the only places an AI key would ever be introduced, behind a
`SearchProvider` adapter interface — and even then, models may only PROPOSE; policy enforces.
