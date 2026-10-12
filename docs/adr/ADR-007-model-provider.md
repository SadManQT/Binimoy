# ADR-007: Language model provider and how it is used

- Status: ACCEPTED for deal assessment (2026-10-12). Search providers for research are decided with LP-012.
- Affects: LP-011, LP-022, FE-14

## Problem

Spec B12 and D.11 want model output to be advisory, grounded in supplied evidence, bound to exactly what it read, and never able to move money or read the vault. A2 wants a provider-neutral seam with fixtures that need no key.

## Decision

1. **One interface**, `AssessmentModel`, with an `id` and one method that takes a bounded context and returns raw output. Two implementations:
   - `fixtureAssessmentModel` (`AI_MODE=fixture`, the default): deterministic, needs no key, restates recorded facts and the parties' words. It is labelled as a fixture wherever it is shown.
   - `claudeAssessmentModel` (`AI_MODE=live`): Claude Opus 5.5 (`claude-opus-5-5`) through the official `@anthropic-ai/sdk` 0.133.0, using `messages.parse` with a JSON output format generated from the same schema the validator uses. Effort is set to `high`. The key is `MODEL_API_KEY`.
2. **No tools.** The model is given no tools of any kind. It cannot fetch more data, and nothing it writes is executed.
3. **Deterministic validation** (`validateAssessment` in `@lp/domain`) before anything is stored or shown: strict shape, every citation must be in the supplied manifest, a message alone cannot support an established fact, and the model's own statements may not pass a verdict on a person or reason from tone, spelling, voice or camera.
4. **One retry, then stop.** A thrown call or an invalid answer is retried once. After that the job fails with `MODEL_UNAVAILABLE` or `INVALID_OUTPUT`. There is no fallback to another provider or to the fixture.
5. **Consent at both ends.** Both parties' monitoring consent is checked when a job starts and again before its result is stored. A result that arrives after a withdrawal is discarded.
6. **Binding.** Each assessment stores the model ID, prompt version, consent policy version, agreement version, delivery version, message cursor, a hash of the context, and the manifest. If any of the versions or the cursor has moved, the assessment is shown as stale.
7. **Budget.** Ten assessment jobs per deal, one in progress at a time.

## Not decided or not done

- **The live path has never been run.** No API key was available. The Claude adapter compiles against the SDK's types; its request has not been sent, its prompt has not been evaluated, and no quality, latency or cost has been measured.
- **Refusal fallbacks are not enabled.** The SDK guidance for Claude Opus 5.5 is to opt into server-side fallbacks by default. This adapter does not: a refusal or a cut-off reply is treated as `MODEL_UNAVAILABLE`, and the deal continues without AI. Enabling fallbacks is a founder decision because it changes which model may process deal messages, which the consent text must then say.
- **Model destination in the consent text** currently reads "none: AI assistance is not enabled yet". Switching `AI_MODE` to `live` requires a new monitoring policy version naming the provider, and fresh consent (D.8). That switch-over is not built.
- **Evaluation harness** (`pnpm eval:ai`, B13): not built. LP-022.
- **Prompt caching, token and cost budgets in currency:** not set. The budget is a job count.
- **Semantic citation checking:** the validator proves a cited identifier exists, not that the cited text supports the statement (D.11 says the same).

## Consequences

- With `AI_MODE=fixture` the feature is a structured mirror of the record, useful for exercising consent, staleness, budget and outage behaviour, and nothing more.
- Model output is in English from the fixture. A live model's language is whatever it writes; no translation layer exists.
