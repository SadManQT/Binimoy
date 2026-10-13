# ADR-010: A light, bold design system with far fewer words

- Status: ACCEPTED (2026-10-13), on the founder's direction of the same day
- Affects: LP-014, every page
- Replaces: the dark ink-and-teal theme described in the LP-014 handoff

## Problem

The founder judged the dark theme and its amount of text unfriendly: "too many texts, every page every feature should be minimalistic", and disliked the colours. They pointed to gpfuturemakers.com as the taste to aim for, as inspiration and not to copy.

What that reference does: one bright flat page colour, deep navy ink, very heavy wide headings, white cards with a thick outline and a hard offset shadow, pill labels, a floating navigation bar, and very short copy.

Specification C36.1 asks for one calm theme and reserves red for failed operations and disputed checklist items. It does not require the theme to be dark.

## Decision

1. **One light theme, called "sticker"**, in `apps/web/app/globals.css`, rewritten from 2,293 lines to about 1,300. The colours are taken from the front-page artwork so the pictures and the page belong together: a periwinkle page, ink navy, white cards, mint and gold accents. No dark mode.
2. **Shape**: cards and controls have a 2px ink outline and a hard shadow; labels are pills; the header and footer float as their own rounded blocks.
3. **Type**: Anek Bangla at weight 800 and 112% width for headings in both languages; body faces unchanged.
4. **Fewer words in view**: the front page shows names and pictures, not paragraphs; "what we do not do" and the less-used login methods are folded; explanations on the deal page sit behind "Learn more" (earlier addendum).
5. **What stays in view regardless**: the test-build bar on every page (INV-15), the allegation wording on reports (ADR-009), consent and acceptance wording, and money states. Amber, not red, still marks a complaint; red still means a failed operation.

## Consequences

- The earlier dark theme is gone; it is in git history before this change.
- The feature pictures were rendered on near-black. They are shown inside dark windows on the light page instead of being regenerated.
- Scroll-reveal animation on the front page was removed: it left sections invisible until scrolled to.
- Long introductions on inner pages (shops, alerts, web lookup, review writing) are restyled but not yet rewritten shorter.

## Not verified

Judged from screenshots in headless Chromium at 1440 and 390 pixels. No real phone, no Safari, no person other than the author of the change has looked at it. Colour contrast is covered only by the automated check on four public pages.
