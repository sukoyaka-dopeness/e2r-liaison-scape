# Cross-App More Menu Presentation

Date: 2026-10-09

Reference: NarrativeLine `46e7fd27c4af9270f60521ed212c19269fa3b877`.

## Changes

The existing native `details/summary` disclosure and LiaisonScape's application-managed opening, first-item focus, ArrowUp/Down and Home/End navigation, Tab dismissal without a focus trap, Escape dismissal with focus return, outside-pointer dismissal, localized action labels, and mobile actions remain unchanged.

The popup now follows NarrativeLine's simple text-row presentation: compact 2px item spacing and 4px panel padding, 40px rows with 8px-by-12px padding, transparent unframed rows, inherited 18px app typography, start alignment, a 12rem minimum width, 8px trigger gap, 6px popup radius, and matching border, hover, and shadow treatment. App-specific actions and their enablement are preserved, including Open/Export, coordinate and space migrations, Auto Layout, and mobile Save/viewport controls.

## Verification and acceptance boundary

Focused source checks verify the retained disclosure, localized app-specific actions, presentation rules, and existing keyboard/focus handlers. `npm.cmd test` passed with 658/658 tests; `npm.cmd run lint` and `npm.cmd run build` passed. Computer Use could not initialize: its retry ended with `windows sandbox failed: helper_unknown_error: setup refresh had errors`; no Codex real-browser PASS is claimed. Human Browser Acceptance for this change is **PENDING**. Review should cover EN/JA, normal and narrow widths, visual comparison with NarrativeLine, open/close and outside dismissal, Tab/Shift+Tab, Escape focus return, ArrowUp/Down and Home/End, and operation of all enabled app-specific entries.

NarrativeLine remained read-only. This presentation change does not standardize menu contents, replace the native disclosure, or claim cross-app interaction equivalence.
