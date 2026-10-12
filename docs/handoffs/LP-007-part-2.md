# Handoff: LP-007 part 2, browser vault

- Base: `main` after LP-007 part 1
- Branch: `chunk-vault-browser`
- Date: 2026-10-12
- **LP-007 is still not complete.** Encrypted delivery between two browsers works. Device verification, key backup and the binding of deliveries to a server-side package record are not built.

## Implemented

- `apps/web/lib/vault-client.ts`: opens the vault in the browser with matrix-js-sdk 43.0.0 and its Rust crypto module, creates one Matrix device per browser profile, creates and registers the vault room, sends and reads delivery payloads.
- `apps/web/app/deals/vault-panel.tsx`: shown on a funded deal. The seller gets one input per vault item. The buyer gets no input at all, only received items, hidden until "show" is pressed.
- A delivery payload carries the deal ID, the agreement version and the terms hash. The reader shows a value only if all three match the deal on screen and the sender is the counterparty.
- The seller cannot send until the buyer's device has joined the room, because a device that does not exist cannot be given keys.
- Sending refuses outright if the room is not encrypted. There is no unencrypted fallback.
- Playwright, with its own production-mode server on port 3100 (`pnpm test:e2e`).

## Commands run and results

| Check | Result |
|---|---|
| `pnpm test:e2e` (Chromium, two separate browser contexts, Supabase, local homeserver) | 1 of 1 passed, 33 s |
| `pnpm test:unit` | 104 of 104 passed |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | exit 0 |

The browser test drives the real pages from sign-up to a funded deal, then asserts:

- before any room exists, the buyer's panel has no password input;
- after the seller creates the room and before the buyer joins, the seller has no input either;
- the secret the seller types appears in the buyer's browser only after "show";
- a sync fetched from the homeserver with the buyer's own token contains `m.room.encrypted` and contains neither the secret nor the delivery event type;
- the seller's page, reloaded, does not contain the secret.

## Not run

- Device verification, cross-signing, key backup, device loss or revocation (V7-22).
- A payload addressed to the wrong deal, item or version (V7-21). The check exists in `readDeliveries`; no test sends a mismatched payload yet.
- Browsers other than Chromium. Mobile widths. Screen readers.
- The browser test in CI: CI has no homeserver and does not run Playwright.

## Limitations

- All gaps in ADR-004 remain open, including that a compromised application server could add a device for a party.
- Deliveries are not yet recorded server-side. Nothing ties a vault event to a delivery package, an inspection or a payout. That is LP-008.
- The device's access token sits in `localStorage`; clearing browser data loses the device and, without key backup, the ability to read earlier deliveries.
- The panel polls every two seconds instead of reacting to sync events.
- `next start` warns that it is not meant for `output: "standalone"`; it works for tests, and staging will use the standalone server.

## Next

LP-008: delivery packages bound to vault events, item inspection, mock providers. Then LP-009: payout and refund.
