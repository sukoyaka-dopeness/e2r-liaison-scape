# Lighthouse JA Dimension Assessment UI preservation — bounded Human acceptance

Recorded: 2026-10-22

Status: **LS-DA-PRESERVE2 FORMAL HUMAN ACCEPTED / CLOSED (BOUNDED)**. This is a limited preservation finding for the specified Lighthouse JA UI path in LiaisonScape `0.2.1`. It is not a new Dimension Assessment editor or a general Dataset safety closure.

## Baseline and earlier evidence gap

The comparison baseline is LiaisonScape's distribution file `public/lighthouse-restoration-demo.ja.e2r.json` (local SHA-256 `0dd2b56a65a7e0d6aca1e9cd3866d1aa16d388c16313b51b1a7a8d706efcb4df` at recording). It contains 10 Entities, 11 Events, 28 Relations, and Dimension Assessment Candidate `0.2.0` with 5 Dimensions and 31 Assessments. The graph presents 14 Entity-to-Entity Relations. The `clara` Entity description is `修復プロジェクトの責任者で構造技師。`; Relation `clara-thomas-supervises` has no description field.

**LS-DA-PRESERVE1 — INCONCLUSIVE / EVIDENCE GAP.** In an isolated local Edge browser, Codex imported a disposable Lighthouse JA copy and saved changes to those Entity and Relation descriptions through their UI dialogs. A service-level round trip of the same intended edits preserved all other JSON content, including Dimension Assessment and Specification declarations; 163 focused automated tests passed. The browser showed the warning-bearing Export action, but its download event timed out. Codex could not compare or re-import the actual UI Export file. Importing a separately service-generated control file did not fill that gap. Preserve this result as the earlier checkpoint, not as a completed UI Export verification.

## LS-DA-PRESERVE2 Human Browser and submitted-file evidence

Human used the **published LiaisonScape `0.2.1`** in Edge InPrivate. The last verified public application-source deployment at this checkpoint was `54202255df0c34e26c2e1b2d2654ba782e4c4d5e`; this Human browser run did not independently hash its loaded assets. The Lighthouse Restoration JA Dataset (「灯台修復プロジェクト」) came from a Hub-to-LiaisonScape Handoff. Human observed 10 Entities and 14 graph-visible Relations; the JSON baseline contains 11 Events and 28 total Relations. Human edited and saved exactly these two fields in the LiaisonScape UI:

| Object | Before | After |
| --- | --- | --- |
| Entity `clara`, `description` | `修復プロジェクトの責任者で構造技師。` | `修復プロジェクトの責任者で構造技師。 [LS-DA-PRESERVE2]` |
| Relation `clara-thomas-supervises`, `description` | Field absent | `[LS-DA-PRESERVE2]` |

Human then used **その他 → E2R JSONを書き出す**, saved the actual file `灯台修復プロジェクト.e2r (2).json`, and submitted it to ChatGPT. Human reports that ChatGPT compared its parsed JSON structure with the published LiaisonScape Lighthouse JA distribution file. The reported differences were **only the two intended descriptions**. The 5 Dimension definitions and 31 Assessment records, Specification declarations, other Extension information, all Entity/Event/Relation IDs and references, and versions matched; no unexpected field loss was reported. Formatting and JSON property order were not treated as content changes.

The submitted Export file is **not directly available in this Codex environment**. The comparison above records the Human-provided result of ChatGPT's check on that submitted file; this documentation pass did not repeat the file comparison or establish an Export-file SHA-256.

Human closed the earlier InPrivate session, opened a new one, and imported that **actual saved Export file** through **E2R Datasetを開く**. Human reported the title, 10 Entities, 14 graph-visible Relations, and normal graph presentation. Screenshots of the respective detail dialogs confirmed both edited descriptions after re-import. These are Human Browser observations, distinct from the earlier Codex Browser, service, and automated evidence.

## Diagnostics and formal boundary

`unknown_extension` and `specification_unavailable` appeared at import and after re-import. Under the [Validator diagnostic contract](https://github.com/sukoyaka-dopeness/e2r-validator/blob/655954d3186d7a1bca24b3f0b81edec76800c925/docs/specification-interoperability.md#diagnostic-states), they are warnings for an uninterpreted payload and unavailable local specification, not proof by themselves of Dataset invalidity or loss. The bounded comparison above found no unintended content change along this path. LiaisonScape did not interpret or edit Dimension Assessment values.

Human formally accepted this conclusion: **for Lighthouse JA, the reviewed Hub Handoff → Entity/Relation description edit → UI Export → actual JSON comparison → new InPrivate import path showed no unintended Dataset content change, including the unsupported Dimension Assessment information.** The accepted scope is this case and this evidence only. It does not guarantee all Datasets, Extensions, edit/delete operations, browsers, or workspaces; does not promote Candidate `0.2.0` to Stable; and does not close Diagnostics D2 or Cross-Context Workspace Safety. HUB-3APP-REVIEW2 overall Formal Human Acceptance, Hub release candidate review, public Hub HTTPS handoff, and Hub deployment remain independent decisions. This record changes no application source or published revision.
