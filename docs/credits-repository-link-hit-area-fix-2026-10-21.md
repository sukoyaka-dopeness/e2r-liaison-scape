# Credits repository link hit area — local correction and limited review

Date: 2026-10-21

Status: **LS-CREDITS-LINK1 HUMAN ACCEPTED / CLOSED (BOUNDED) LOCALLY / PUBLICATION PENDING** at `ff9d1d8c720dc80bea5b7ab699d1312cbc9b6bbf`. LiaisonScape `0.2.1` already has a separate public acceptance; this local change does not revise it.

## Cause and scope

Human observed that the blank space to the right of each Repository link in LiaisonScape Credits opened the link. `src/components/CreditsDialog.tsx` renders the two anchors as direct children of `.credits-links`. Its `display: grid` rule previously left grid-item alignment at the default stretch, so an anchor occupied the full available row width. An isolated Edge check reproduced that geometry by temporarily restoring the old alignment in the test page: the first anchor became 399px wide, the same as its navigation row, and the right-side blank point targeted the anchor.

The local correction adds `justify-items: start` to `.credits-links` in `src/styles.css`. Both anchors now occupy the width of their displayed text. Their URLs, labels, DOM, focus order, dialog handling, and other styles are unchanged. This aligns the link-area behavior with the Human-accepted ParameterPlotter and NarrativeLine Credits without changing either sibling application.

## Verification boundary

- **Source:** only the Credits navigation grid alignment changes. Application Version `0.2.1`, Creator, `First release: 2026-08-16`, `Updated: 2026-10-21`, EN/JA strings, acknowledgement and repository URLs remain unchanged. The two dates describe the existing published version; this local fix has not been deployed.
- **Automated / DOM:** existing Credits integration tests cover EN/JA identity, links, Close/Escape/backdrop and focus restoration. The full test, lint and build results for this checkpoint are recorded below. No new static test mirrors the single CSS declaration; the hit area was measured in a real browser.
- **Codex Browser, isolated local Edge:** at 900px and 360px in both EN and JA, computed `.credits-links` alignment was `start`; both links were narrower than the navigation row. Browser hit testing and actual pointer input found each link's text and excluded the right-side blank space. With navigation suppressed by a test-only event listener, text clicks and focused Enter produced the intended link events; blank-space clicks produced none. Tab/Shift+Tab moved between the anchors. Escape closed Credits and restored focus to its opener after the next animation frame. At 360px there was no document horizontal overflow. A JA narrow-width screenshot showed the two link labels and existing Credits content without clipping.
- **Human Browser:** the Codex checks above were pre-acceptance evidence. The later, separate Human Browser decision is recorded below.

## Limited Human Browser Review requested before acceptance (historical)

Use the local checkpoint in a disposable browser Workspace. In EN and JA, at a normal width and a narrow width (about 360px):

1. Open Credits and confirm `0.2.1`, Creator, First release, Updated, acknowledgement and both Repository labels remain legible.
2. For **each** link, click its text and confirm the intended Repository opens. Click the blank space immediately to its right and confirm no link opens.
3. Tab to each link, activate it with Enter, and use Shift+Tab to confirm ordinary focus movement. Close Credits with Close, Escape and backdrop, checking that focus returns to the Credits opener.

The requested Human decision is limited acceptance of this Credits link-area correction and its adjacent keyboard/dismiss behavior. Do not infer Product-wide or public-environment acceptance from it.

## LS-CREDITS-LINK1 Formal Human Acceptance — 2026-10-21

Human formally accepted the local correction at exact source commit `ff9d1d8c720dc80bea5b7ab699d1312cbc9b6bbf` as **HUMAN ACCEPTED / CLOSED (BOUNDED)**. In the local LiaisonScape browser, Human reported PASS for EN/JA Credits at normal and 360px widths; both Repository links opened the correct URLs from their text, while the blank space to each link's right did not navigate. Tab, Shift+Tab, Enter, Close, Escape, backdrop dismissal and focus restoration passed. No major Console Error was observed in the reviewed interactions. Human-provided screenshots covered EN/JA at 360px and EN at 1200px.

This is **Human Browser evidence**, separate from the 900px/360px isolated Codex Edge and automated evidence above. It accepts the Credits link hit area and adjacent reviewed display/interaction only. It does not repeat LiaisonScape-wide acceptance or establish behavior in every browser, viewport, navigation path or failure condition. The accepted source commit remains **local and unpushed**; the public application remains at `fdb4b099b489e65c062d33586f01db5746a632a9` until a separately authorized deployment.

## Publication boundary

No push or Deployment is authorized by this local acceptance. `First release: 2026-08-16` is historical and stays fixed. The current `Updated: 2026-10-21` records the existing deployment, not a future publication date. Before any later push, Human must approve the exact publication SHA and intended JST date, decide whether Updated needs a new value, and separately authorize the push with its automatic Pages deployment. A date correction would create a new source SHA and require appropriately limited re-review.

The README Version section previously described `0.2.1` as a local candidate and `0.2.0` as published. A separate documentation-only checkpoint now aligns that current-status description with the published `0.2.1` source; it does not publish this Credits correction.

## Local verification results

- `npm test`: **673/673 PASS**. The runner printed React/jsdom `detachEvent` diagnostics, but reported zero failed tests.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**, 87 modules transformed.
- Isolated Edge geometry and interaction check: **4/4 locale-width combinations PASS**. Restoring the old grid alignment only in the disposable test page reproduced the stretched, clickable blank area; no application source was changed for that comparison.
- `git diff --check`: **PASS** before the local checkpoint.
