# Cross-App More Menu Typography Correction

Date: 2026-10-09

NarrativeLine's More menu at source `46e7fd27c4af9270f60521ed212c19269fa3b877`
remains the read-only visual reference. Human Browser Review found that
LiaisonScape's More rows still appeared larger after the prior presentation
change. The cause was the final CSS cascade: `.maintenance-menu__items > button`
used `font: inherit` after its ordinary-control rule, restoring the app root
size (18px at desktop widths, 16px at the narrow breakpoint) rather than the
15px size explicitly applied to NarrativeLine's More rows. LiaisonScape also
used 40px minimum rows and 8px-by-12px padding while NarrativeLine resolved to
36px and 5px-by-9px.

LiaisonScape now explicitly resolves its menu rows to 15px / 120%, 36px
minimum height, and 5px-by-9px padding. The narrow disclosure trigger label
also remains 15px. Existing panel spacing, border, radius, shadow, hover
appearance, localized app-specific entries, native `details/summary`,
keyboard navigation, Escape, outside-pointer dismissal, and focus behavior are
preserved. NarrativeLine and ParameterPlotter functionality were not changed
from this repository.

The focused More-menu tests passed 2/2; the full suite passed 658/658,
`npm.cmd run lint` passed, and `npm.cmd run build` passed. The test run emitted
non-failing jsdom `attachEvent` / `detachEvent` diagnostics in input-focus
tests. Computer Use initialization failed with
`helper_unknown_error: setup refresh had errors`; no browser computed-style or
visual check is claimed. Human Browser Acceptance remains **PENDING**. Review
EN/JA at normal and narrow widths against the NarrativeLine reference and
confirm all existing menu and focus operations.
