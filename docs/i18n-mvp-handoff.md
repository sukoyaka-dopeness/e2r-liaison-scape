# LiaisonScape i18n MVP Handoff

## Purpose

This document is the checkpoint for the current LiaisonScape i18n workstream.
The next Codex session should read this file together with the decision record
and remaining-string inventory before making further changes.

## Why i18n exists

LiaisonScape is being prepared for English and Japanese use as an E2R sibling
application. Locale is an application preference / view-state concern. It is
not Dataset data and must not affect Dataset interoperability.

Changing locale must not change Dataset contents, Entity / Event / Relation
objects, Coordinates, graph state, selection, navigation semantics, or export
semantics. Technical/specification vocabulary and natural user-facing Japanese
application vocabulary are intentionally treated as separate layers.

## Fixed architecture

- `Locale = "en" | "ja"`.
- Small typed internal dictionary in `src/i18n.ts`.
- Browser-language detection for the initial locale.
- localStorage persistence with invalid-value fallback.
- `document.documentElement.lang` synchronization.
- One App-level locale state shared by Home and Workspace.
- Home is the only locale-switch entry point.
- Workspace reflects the selected locale but has no locale switch.
- Reload restores the application locale.
- Locale is never written into the E2R Dataset or export.

## Completed localization slices

- Home headings, description, actions, guide label, footer descriptor, and
  locale switch.
- Workspace shell labels.
- Workspace fixed toolbar/control labels.
- Selection/editing visible strings:
  - `Drag the selected relation to adjust its curve.`
  - `Edit Relation`
  - `Edit Entity`
- Workspace metadata visible strings:
  - `Dataset title` → `Datasetタイトル`
  - `Untitled` → `タイトルなし`
- `Not assigned` is deliberately not dictionary-backed and is excluded from
  the visible inventory because it is not part of the current accepted UI.
- Canvas context menu visible strings:
  - `Add Entity` → `エンティティを追加`
  - `Cancel` → `キャンセル`
- Creation Dialog visible strings:
  - `Create Entity` → `エンティティを追加`
  - `Create Relation` → `つながりを追加`
  - `Source Entity` → `接続元のエンティティ`
  - `Target Entity` → `接続先のエンティティ`
  - `Select source` → `接続元を選択`
  - `Select target` → `接続先を選択`
  - `Name` → `名前`
  - `Description` → `説明`
  - `Cancel` → `キャンセル`
  - `Save Entity` → `エンティティを作成`
  - `Save Relation` → `つながりを作成`

`CreationDialog` receives the existing App-level locale. No Dataset or graph
behavior was changed by these localization slices.

## Source and documentation state

Relevant source files:

- `src/i18n.ts` — locale type, dictionary, detection, persistence, and helper.
- `src/App.tsx` — App-level locale state and UI wiring.
- `src/components/CreationDialog.tsx` — localized Creation Dialog labels.
- `tests/i18n.test.ts` — locale foundation and dictionary tests.

Relevant documents:

- `docs/i18n-mvp-decision.md` — architecture and terminology decisions.
- `docs/i18n-remaining-string-inventory.md` — remaining user-facing English
  inventory.
- `docs/future-header-navigation-unification.md` — deferred navigation work;
  do not modify as part of i18n.

## Inventory corrections

The following strings are present in JSX but hidden with `display: none` and
are not current visible UI inventory items:

- `Entity graph`
- `Entity-first E2R relationship graph.`
- `Graph`

`Not assigned` is also excluded from the visible localization inventory as an
unused/non-visible fallback for the accepted UI state.

## Remaining work

Use `docs/i18n-remaining-string-inventory.md` as the source of truth. Remaining
categories include:

- Entity Detail Dialog;
- Relation Detail Dialog;
- Confirmation Dialog;
- dynamic status and result messages;
- refusal reasons;
- validation, open, and export messages;
- migration result messages;
- accessibility-only strings.

Creation Dialog and the two requested canvas context-menu items are complete.
Do not translate dynamic messages by ad hoc string concatenation. Use typed
formatters and deliberate mappings for counts, IDs, names, refusal reasons,
diagnostic codes/paths, parser/validator results, incident Relation counts,
and migration results.

## Explicitly deferred / do not reopen here

- Home / Workspace navigation semantics;
- `<a>` / `<button>` unification;
- Browser Back / Forward architecture changes;
- Dataset preservation and navigation lifecycle changes;
- Coordinate and graph behavior;
- Relation endpoint editing;
- Direct Graph Authoring changes;
- mobile redesign;
- relation routing/collision avoidance;
- Group / Cluster;
- First Distribution;
- Dataset title editing.
- Future UI polish: reduce oversized button text and button borders in both
  LiaisonScape and the sibling NarrativeLine application when the timing is
  appropriate. This note records a deferred visual adjustment only; it does
  not authorize changes to button behavior, semantics, or interaction hit
  areas in the current workstream.

NarrativeLine is not part of this LiaisonScape implementation checkpoint.

## Verification baseline

The current implementation checkpoint is green:

- 121 tests passed;
- lint passed;
- build passed;
- `git diff --check` passed.

## Resume point

The next session should:

1. read `AGENTS.md` and this handoff;
2. read `docs/i18n-mvp-decision.md`;
3. read `docs/i18n-remaining-string-inventory.md`;
4. inspect current `git status` and `git log`;
5. choose one small remaining inventory category before implementation.

The recommended next implementation unit is a small, explicitly scoped
dialog or fixed visible category—not dynamic messages or a broad replacement.

## Checkpoint status

This handoff records the current i18n-related working-tree changes. The
checkpoint commit is created separately after final verification. No push is
part of this handoff.
