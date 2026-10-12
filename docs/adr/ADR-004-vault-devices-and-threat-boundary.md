# ADR-004: Secret vault design and threat boundary

- Status: ACCEPTED for the server side (2026-10-12). The browser side is not built yet.
- Affects: LP-007, LP-008, LP-017, FE-15

## Problem

Spec D.7 requires that delivery secrets travel end-to-end encrypted between the two parties through a maintained Matrix SDK, that no application component holds decryption keys, and that no new cryptographic protocol is invented.

## Decision

1. **Homeserver:** Synapse 1.162.0, pinned by image digest, run locally in Docker by `pnpm matrix:local`. Federation is off, open registration is off, rooms are encrypted by default.
2. **Accounts:** one Matrix account per application user, with the user ID derived from the application user ID. There are no Matrix passwords.
3. **Login:** the application signs a one-minute token naming only the signed-in user. The browser trades it at the homeserver for its own device and access token. The homeserver allows two minutes of clock leeway, so a token is usable for about three minutes.
4. **Rooms:** a party's browser creates the vault room and reports its ID. Before the room becomes the deal's vault, the application asks the homeserver's admin API who is in it. It must be invite-only, not federated, encrypted with Megolm, and contain exactly the deal's two parties. One room per deal, never replaced; one room never serves two deals.
5. **Delivery events:** the application can confirm that an event exists in the vault room, is encrypted, and was sent by the expected party. That proves a payload was handed over. It proves nothing about its contents.
6. **Application access:** the application uses an admin account for metadata only. That account is never a room member and has no room keys.

## What this protects

- The application database, logs and model prompts never contain vault plaintext, because the server never has it.
- A party's Matrix account cannot be used by another application user: tokens are minted only for the session's own user.
- A third account cannot be slipped into a vault room unnoticed at registration time.

## What this does not protect (open gaps)

These are known and not yet closed. FE-15 stays in progress until they are either closed or explicitly accepted by the founder.

1. **A malicious or compromised application server can add a device.** Because the server mints login tokens, it could log in as a party and receive room keys for messages sent afterwards. Closing this needs cross-signing with user-held recovery keys and a rule that keys go only to verified devices (D.7 device verification). Not built.
2. **Membership is checked only at registration.** A party could invite a third account later. Closing this needs a re-check before each delivery is accepted, or power levels that forbid invites. Not built.
3. **Compromised browser, extension or device.** Out of scope by D.7; must be stated to users before funding.
4. **Compromised web deployment** serving altered JavaScript. Out of scope by D.7; reduced, not removed, by release controls and a strict content security policy. No CSP is set yet.
5. **Lost devices.** Without key backup, losing every device loses access to earlier deliveries. Key backup and recovery are not built.
6. **A recipient who copies a secret** keeps it. Nothing can change that.

## Not run

- Any browser-side encryption: creating a device, exchanging keys, encrypting and decrypting a delivery between two real browser sessions.
- Device verification, key backup, device revocation, new-device behaviour (V7-22).
- Wrong recipient, item or version binding checks in the client (V7-21).

## Consequences

- The `secret_vault` capability stays `UNCONFIGURED` in the template registry until the browser side passes a two-session test.
- Staging needs a reachable homeserver with real TLS; the local one listens on localhost only.
- CI has no homeserver, so the vault tests are reported as skipped there.
