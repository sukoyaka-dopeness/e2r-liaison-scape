# LiaisonScape Home Ko-fi — Human browser review preparation

Recorded: 2026-10-24 JST

Status: **LIAISONSCAPE KOFI HOME HUMAN BROWSER ACCEPTED / PASS / CLOSED (BOUNDED) / LOCAL UNPUBLISHED CANDIDATE**. The preparation and pending-review text below record the earlier checkpoint; the later Human decision is recorded in the final section.

## Candidate identity and purpose

The candidate is based on LiaisonScape HEAD `33910d28368c390ff437fce12e03920e60a1dbf9`. Its uncommitted Ko-fi change is limited to `src/App.tsx`, `src/i18n.ts`, `src/styles.css`, and `tests/appUiIntegration.test.ts`. Other untracked research and temporary files are outside this candidate. Git HEAD alone does not identify the reviewed working-tree content; the file SHA-256 values at this checkpoint are:

| File | SHA-256 |
| --- | --- |
| `src/App.tsx` | `FC297205D04AE41C187A704A903C069F395C70D5946FF4B5190AAE4CDD620015` |
| `src/i18n.ts` | `30C28059B348A3528820406367516F75572CD6B8FCC04EDCDE739EB4FC791E4C` |
| `src/styles.css` | `61C6C36B6FC1ED5F40AB2CABC22AEB19DE91278756A1D8DF6EFEDB41621DE89F` |
| `tests/appUiIntegration.test.ts` | `DFC6E972890F5E9CB0B57223BAF1D3C387DAEB3D1BF626D2000AAF10CDAF3711` |

Home places `https://ko-fi.com/sukoyaka_dopeness` immediately below GitHub Sponsors as a secondary support link. The EN text is “Support E2R on Ko-fi”; JA is “Ko-fiでE2Rを支援する”. Both links use `target="_blank"` and `rel="noreferrer"`. The existing global `:focus-visible` rule applies to links. The candidate does not change Dataset, Handoff, Workspace, Credits, Version, or payment behavior.

## Separate evidence

- Current local `npm test` **673/673 PASS**, `npm run lint` PASS, `npm run build` PASS, and `git diff --check` PASS. The UI integration test checks EN/JA text, link destination, Sponsors-before-Ko-fi order, and external-link attributes. It does not prove rendered geometry or keyboard interaction.
- The Vite review server is currently serving `http://127.0.0.1:4186/e2r-liaison-scape/`. HTTP returned 200, and the served `src/App.tsx` contains the adopted Ko-fi URL. Server availability and source delivery are not browser evidence.
- Codex Browser Review: **NOT PERFORMED**. The isolated in-app Browser was unavailable. The available Edge and Chrome connections were existing user profiles, so they were not used. At this preparation checkpoint, no Human Browser result for this Ko-fi candidate had been reported.

## Human review checklist

Use a dedicated disposable browser profile or private review window that has no existing LiaisonScape Dataset or Workspace. Confirm the current local server and candidate file hashes before attributing observations to this checkpoint. Do not use personal saved work or perform a payment.

1. At a normal width, inspect EN Home: Ko-fi appears immediately below GitHub Sponsors, reads naturally, and remains visually secondary to Dataset and Sample actions.
2. Switch to JA and inspect the corresponding wording, order, spacing, and ordinary Home controls.
3. At a genuinely narrow rendered viewport, inspect EN and JA for wrapping, clipping, horizontal scroll, and support-link prominence. Record the actual viewport width and browser/profile used if available.
4. Use Tab and Shift+Tab to reach both support links; confirm visible focus. Activate Ko-fi with Enter, check the new tab and exact destination URL, then return without login, payment, or donation.
5. Check that locale switching, Credits, and the main Home actions still work in the reviewed scope. Avoid importing or editing a real Dataset.

Record PASS/FAIL/NOT TESTED per item and any specific reproduction condition. Human may then decide a bounded Ko-fi Home Acceptance based on the actual review. This document makes no Human Acceptance, Release Metadata, Commit, Push, or Deployment decision. Other LiaisonScape accepted functions and outstanding issues retain their own boundaries.

## Subsequent Formal Human decision — 2026-10-24 JST

Human reported **5/5 PASS** for the five review items above and expressly decided **LIAISONSCAPE KOFI HOME HUMAN BROWSER ACCEPTED / PASS / CLOSED (BOUNDED)**. The reported review covers EN Home placement and secondary visual priority, JA text and placement, narrow-width display, Tab/Focus/Enter operation of the external link, and the reviewed locale switch, Credits, and main Home actions. The review report did not specify browser name, exact viewport dimensions, profile details, or a full interaction trace; none is inferred.

Immediately before recording this decision, LiaisonScape HEAD remained `33910d28368c390ff437fce12e03920e60a1dbf9` and SHA-256 of all four implementation/test files matched the preparation table above. No runtime or test file was changed for this decision. The accepted subject is that identified local candidate, not every possible future change to these paths. The earlier unperformed Codex Browser check remains **NOT PERFORMED**; it is distinct from the later Human Browser PASS.

This limited acceptance does not establish new Dataset, Workspace, Handoff, Validator, or other application-function acceptance. It does not change the published LiaisonScape `0.2.1` closure, decide the next Release Version or Credits Updated, or authorize Push or Deployment. Human authorized a local Commit for the accepted candidate and this evidence record only; publication remains separate.
