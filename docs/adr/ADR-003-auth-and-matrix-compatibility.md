# ADR-003: Auth and Matrix SDK compatibility

- Status: PROPOSED (the decision is made in LP-003)
- Date: 2026-10-12
- Affects: LP-003, LP-007, FE-09, FE-15

## Versions tested

Installed together in a throwaway directory outside the repository.

| Package | Version resolved |
|---|---|
| next | 16.4.0 |
| react / react-dom | 19.3.0 |
| matrix-js-sdk | 43.0.0 |
| better-auth | 1.7.7 |
| typescript | 7.0.2 |

## Observed

- Peer dependency warnings on install: none.
- `next build` with a client component that imports `matrix-js-sdk`, calls `createClient` and `initRustCrypto({ useIndexedDB: false })`: succeeded, route prerendered as static.

## Not run

- Browser runtime check that the crypto WebAssembly module actually initialises: NOT_RUN. No browser was driven in this session. A successful build does not prove the module loads at runtime.
- Homeserver login, device verification, key backup and recovery: NOT_RUN. These need a Matrix homeserver and belong to LP-007.
- Any auth flow: NOT_RUN. Only that `better-auth` installs beside the chosen Next and React versions was checked. It was imported nowhere.

## Open for LP-003

- Choose the auth library and record the reason. `better-auth` is a candidate, not a decision.
- Run the browser crypto check before LP-007 depends on it.
- Choose the homeserver for local and staging use.
