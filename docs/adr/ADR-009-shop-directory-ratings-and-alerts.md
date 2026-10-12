# ADR-009: Shop directory, reviewer ratings and alerts

- Status: ACCEPTED (2026-10-12), on the founder's direction of the same day
- Affects: LP-012, LP-013, LP-014, FE-01 to FE-08

## Problem

The founder asked for shop discovery, shop profiles, reviews with ratings, scam reports, a visible alerts section and trust indicators to be the centre of the product and of the front page.

Parts of that request meet rules the specification states as limits, not preferences:

- C7.1: no safe/unsafe labels, trust scores or fraud probabilities; a label describes the author's account, not the subject's character.
- C7.5 and C36.4: no overall positive or negative score; no ranking of one subject as safer.
- C9.4 and D.10: moderation checks the publication rules; it is not a finding about the shop. No response is not an admission.
- C36.1: a calm workspace, not a dramatic scam-warning dashboard; red is for failed operations and disputed checklist items, not for a verdict on a person.

These limits exist because a platform that publishes "scammer" or "trusted" about a named business, on unverified reports, harms people when it is wrong and exposes its owner to claims.

## Decision

Build everything asked for that those limits allow, and state the two places where the limit holds.

1. **Shop directory and categories** (`/shops`). A shop is listed once it has at least one published experience. A private web lookup never creates a listing (D.9). Ten browsing categories, set by the first reporter.
2. **Shop profile** (`/shops/[id]`). Published experiences, replies and resolutions, with counts by type and a date range.
3. **Ratings.** A reviewer may give their own experience 1 to 5. The profile shows the mean of published ratings and how many there are, worded as the reviewers' average. This is a summary of what users wrote, not a score computed by the platform, and it is never used to order shops.
4. **Scam reports.** A complaint can name what the author alleges (not delivered, access revoked, blocked after payment, and so on). It is shown as "the author's allegation, not verified", after the same author approval and moderation as any report, with the shop's right of reply.
5. **Alerts** (`/alerts`, and the front page). Published complaints, newest first, plus general warnings about patterns written by moderators, signed to them in the record and retractable.
6. **Evidence indicators instead of a trust badge.** How many complaints are published, how many have a reply, how many their authors say were resolved. No "trusted", "safe" or "scam" label is computed or shown.
7. **Safeguards.** One live report per person per shop; a daily submission limit; identifiers refused in public text; author approval of the exact text; moderation by someone other than the author; appeal to a different moderator.

## What was asked for and not built, and why

- **A platform verdict on whether a shop is trustworthy.** Replaced by the evidence indicators in point 6. Reason: C7.1 and D.10 above. Changing this is a founder decision that should come with legal advice; the place to change is `ComplaintLine` in `apps/web/app/components/shop-ui.tsx` and the wording on the shop page.
- **Sorting or highlighting shops by rating.** Lists are ordered by recency or by amount written. Reason: C36.4.
- **Evidence uploads.** Reports are text. The upload pipeline in D.9 (type checks, quarantine, scanning, redacted copies) is not built.
- **Verified reviews.** Nothing checks that a reviewer bought from the shop, or that a person replying speaks for the shop. Both are labelled as unverified.

## Consequences

- Amber, not red, marks complaints.
- The directory is small until people write: there is no imported data and no scraping.
- Ratings can be gamed by several accounts. The limits above slow that down; they do not stop it.
