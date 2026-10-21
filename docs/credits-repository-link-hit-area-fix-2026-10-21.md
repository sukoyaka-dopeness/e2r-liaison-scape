# Credits repository link hit area — local acceptance and public update

Date: 2026-10-21

Status: **LS-CREDITS-LINK1 and LS-CREDITS-LINK3 HUMAN ACCEPTED / CLOSED (BOUNDED)**. The accepted local source commit is `ff9d1d8c720dc80bea5b7ab699d1312cbc9b6bbf`; the current published `main` is `54202255df0c34e26c2e1b2d2654ba782e4c4d5e`. LiaisonScape `0.2.1` has a separate Public Release Closure, unchanged by this Credits follow-up.

## Cause and scope

Human observed that the blank space to the right of each Repository link in LiaisonScape Credits opened the link. `src/components/CreditsDialog.tsx` renders the two anchors as direct children of `.credits-links`. Its `display: grid` rule previously left grid-item alignment at the default stretch, so an anchor occupied the full available row width. An isolated Edge check reproduced that geometry by temporarily restoring the old alignment in the test page: the first anchor became 399px wide, the same as its navigation row, and the right-side blank point targeted the anchor.

The local correction adds `justify-items: start` to `.credits-links` in `src/styles.css`. Both anchors now occupy the width of their displayed text. Their URLs, labels, DOM, focus order, dialog handling, and other styles are unchanged. This aligns the link-area behavior with the Human-accepted ParameterPlotter and NarrativeLine Credits without changing either sibling application.

## Verification boundary

- **Source:** only the Credits navigation grid alignment changes. Application Version `0.2.1`, Creator, `First release: 2026-08-16`, `Updated: 2026-10-21`, EN/JA strings, acknowledgement and repository URLs remain unchanged. At this local verification checkpoint, the correction had not yet been deployed; its later public deployment is recorded below.
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

This is **Human Browser evidence**, separate from the 900px/360px isolated Codex Edge and automated evidence above. It accepts the Credits link hit area and adjacent reviewed display/interaction only. It does not repeat LiaisonScape-wide acceptance or establish behavior in every browser, viewport, navigation path or failure condition. At this local acceptance checkpoint, the source commit was unpushed and the public application remained at `fdb4b099b489e65c062d33586f01db5746a632a9`; the later publication is recorded below.

## Publication boundary at local acceptance (historical)

No push or Deployment is authorized by this local acceptance. `First release: 2026-08-16` is historical and stays fixed. The current `Updated: 2026-10-21` records the existing deployment, not a future publication date. Before any later push, Human must approve the exact publication SHA and intended JST date, decide whether Updated needs a new value, and separately authorize the push with its automatic Pages deployment. A date correction would create a new source SHA and require appropriately limited re-review.

The README Version section previously described `0.2.1` as a local candidate and `0.2.0` as published. A separate documentation-only checkpoint aligned that status description with the then-published `0.2.1` source; it did not publish this Credits correction.

## Local verification results

- `npm test`: **673/673 PASS**. The runner printed React/jsdom `detachEvent` diagnostics, but reported zero failed tests.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**, 87 modules transformed.
- Isolated Edge geometry and interaction check: **4/4 locale-width combinations PASS**. Restoring the old grid alignment only in the disposable test page reproduced the stretched, clickable blank area; no application source was changed for that comparison.
- `git diff --check`: **PASS** before the local checkpoint.

## LS-CREDITS-LINK3 public deployment and Formal Human Closure — 2026-10-21

Human separately approved the exact publication candidate `54202255df0c34e26c2e1b2d2654ba782e4c4d5e`, its two commits and three files (`src/styles.css`, `README.md`, and this record), `Updated: 2026-10-21`, and an ordinary `main` push with automatic Pages deployment. The push advanced public `main` from `fdb4b099b489e65c062d33586f01db5746a632a9` to that approved SHA. The single [GitHub Actions run 39555265275](https://github.com/sukoyaka-dopeness/e2r-liaison-scape/actions/runs/39555265275) succeeded: tests, lint, build, and Pages deployment were steps in that workflow. Pages deployment completed at **2026-10-21 15:27:30 JST**, matching Credits `Updated: 2026-10-21`; `First release: 2026-08-16` remained unchanged. The public URL is <https://sukoyaka-dopeness.github.io/e2r-liaison-scape/>.

**Post-deployment verification: PASS (BOUNDED).** The published main matched the approved SHA, and the served principal JS/CSS assets matched the approved build byte for byte. In an isolated Edge profile on public HTTPS, Codex checked EN/JA at 900px and 360px: both Repository links' text was targeted while the right-side blank area was not; link URLs, Tab/Shift+Tab/Enter, Close/Escape/backdrop, focus restoration, Version `0.2.1`, and both dates were consistent. No major Runtime Error appeared in the observed interactions. External navigation was suppressed by a test-only listener in that Codex Browser check; the actual link destinations had already passed the separate local Human Browser review. These are **Codex Browser and deployment evidence**, not a new Human Browser PASS or exhaustive browser/environment acceptance.

After reviewing the deployment result and bounded Codex Browser evidence, Human formally decided **LS-CREDITS-LINK3 HUMAN ACCEPTED / CLOSED (BOUNDED)**. This closes the Credits hit-area public update only. The earlier LiaisonScape `0.2.1` Public Release Closure and LS-CREDITS-LINK1 local Human Browser acceptance retain their separate scopes. Broader Credits visual parity, Diagnostics D2, and unrelated application or Hub work remain independent. This documentation-only record is a local follow-up; it is not a new deployed application revision.
