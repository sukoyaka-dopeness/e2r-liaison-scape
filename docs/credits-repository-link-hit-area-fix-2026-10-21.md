# Credits repository link hit area — local correction and limited review

Date: 2026-10-21

Status: **LOCAL FIX PREPARED / HUMAN BROWSER REVIEW PENDING / NOT PUBLISHED**. LiaisonScape `0.2.1` already has a separate public acceptance; this local change does not revise it.

## Cause and scope

Human observed that the blank space to the right of each Repository link in LiaisonScape Credits opened the link. `src/components/CreditsDialog.tsx` renders the two anchors as direct children of `.credits-links`. Its `display: grid` rule previously left grid-item alignment at the default stretch, so an anchor occupied the full available row width. An isolated Edge check reproduced that geometry by temporarily restoring the old alignment in the test page: the first anchor became 399px wide, the same as its navigation row, and the right-side blank point targeted the anchor.

The local correction adds `justify-items: start` to `.credits-links` in `src/styles.css`. Both anchors now occupy the width of their displayed text. Their URLs, labels, DOM, focus order, dialog handling, and other styles are unchanged. This aligns the link-area behavior with the Human-accepted ParameterPlotter and NarrativeLine Credits without changing either sibling application.

## Verification boundary

- **Source:** only the Credits navigation grid alignment changes. Application Version `0.2.1`, Creator, `First release: 2026-08-16`, `Updated: 2026-10-21`, EN/JA strings, acknowledgement and repository URLs remain unchanged. The two dates describe the existing published version; this local fix has not been deployed.
- **Automated / DOM:** existing Credits integration tests cover EN/JA identity, links, Close/Escape/backdrop and focus restoration. The full test, lint and build results for this checkpoint are recorded below. No new static test mirrors the single CSS declaration; the hit area was measured in a real browser.
- **Codex Browser, isolated local Edge:** at 900px and 360px in both EN and JA, computed `.credits-links` alignment was `start`; both links were narrower than the navigation row. Browser hit testing and actual pointer input found each link's text and excluded the right-side blank space. With navigation suppressed by a test-only event listener, text clicks and focused Enter produced the intended link events; blank-space clicks produced none. Tab/Shift+Tab moved between the anchors. Escape closed Credits and restored focus to its opener after the next animation frame. At 360px there was no document horizontal overflow. A JA narrow-width screenshot showed the two link labels and existing Credits content without clipping.
- **Human Browser:** the present browser checks are Codex evidence. They do not establish a new Human Browser PASS or formal acceptance.

## Limited Human Browser Review

Use the local checkpoint in a disposable browser Workspace. In EN and JA, at a normal width and a narrow width (about 360px):

1. Open Credits and confirm `0.2.1`, Creator, First release, Updated, acknowledgement and both Repository labels remain legible.
2. For **each** link, click its text and confirm the intended Repository opens. Click the blank space immediately to its right and confirm no link opens.
3. Tab to each link, activate it with Enter, and use Shift+Tab to confirm ordinary focus movement. Close Credits with Close, Escape and backdrop, checking that focus returns to the Credits opener.

The requested Human decision is limited acceptance of this Credits link-area correction and its adjacent keyboard/dismiss behavior. Do not infer Product-wide or public-environment acceptance from it.

## Publication boundary

No push or Deployment is authorized by this checkpoint. `First release: 2026-08-16` is historical and stays fixed. The current `Updated: 2026-10-21` records the existing deployment, not a future publication date. Before any later push, Human must accept the local fix, choose the exact publication SHA and intended JST date, decide whether Updated needs a new value, and separately authorize the push with its automatic Pages deployment. A date correction would create a new source SHA and require appropriately limited re-review.

The existing README Version section still describes `0.2.1` as a local candidate and `0.2.0` as published, although the current checked-in application and public main are `0.2.1`. That older publication text is outside this link-area correction; reconcile it in a separately approved documentation step before treating the next public candidate as fully ready.

## Local verification results

- `npm test`: **673/673 PASS**. The runner printed React/jsdom `detachEvent` diagnostics, but reported zero failed tests.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**, 87 modules transformed.
- Isolated Edge geometry and interaction check: **4/4 locale-width combinations PASS**. Restoring the old grid alignment only in the disposable test page reproduced the stretched, clickable blank area; no application source was changed for that comparison.
- `git diff --check`: **PASS** before the local checkpoint.
