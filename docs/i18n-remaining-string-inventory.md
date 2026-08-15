# Remaining User-Facing English String Inventory

Status: Inventory only; no localization implementation in this pass.

Scope: LiaisonScape source code after Foundation, App wiring, Home
localization, Workspace shell localization, and Workspace fixed-label
localization. Strings already routed through `src/i18n.ts` are excluded from
the remaining-English counts. Dataset-authored names/descriptions, IDs,
Extension IDs, Coordinate Space IDs, diagnostic codes, and Product names are
not application strings and are not listed as translation targets.

Counts below are unique inventory entries, not rendered occurrences.

## A. Remaining visible fixed strings

| Source | Current English text | Trigger / state | Kind | Formatter |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | `Dataset title` | Dataset metadata label | fixed | no |
| `src/App.tsx` | `Untitled` | Dataset has no title | fixed fallback | no |
| `src/App.tsx` | `Drag the selected relation to adjust its curve.` | Selected Relation state | fixed hint | no |
| `src/App.tsx` | `Edit Relation` | Selected Relation action | fixed | no |
| `src/App.tsx` | `Edit Entity` | Selected Entity action | fixed | no |

`Entity graph`, `Entity-first E2R relationship graph.`, and `Graph` exist in
the JSX but are not rendered: `.page-header` and `.graph-section h2` both have
`display: none` in `src/styles.css`. They are therefore excluded from the
remaining visible-string inventory and should not be added to the dictionary
on the basis of their dormant JSX presence.

Fixed visible entries in this category: **6**.

The Workspace toolbar labels (`Open Dataset`, `Export E2R JSON`, `Add Entity`,
`Add Relation`, coordinate save, `More`, migration controls, zoom labels) are
already dictionary-backed and are not repeated here.

## B. Remaining dynamic status and result messages

| Source | Current English text | Trigger | Dynamic values | Formatter needed |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | `Your Dataset is still open. Continue to return to the workspace.` | Browser Back returns Home | none | no |
| `src/App.tsx` | `Import failed: ${parseError}` | JSON parse failure | parser error reason | yes |
| `src/App.tsx` | `Dataset is invalid according to the Core or supported Extensions.` | Validator rejects opened Dataset | implicit diagnostics | no, but structured diagnostic formatter likely |
| `src/App.tsx` | `Loaded ${entities} Entities and ${relations} Relations.` | Valid Dataset opened | Entity count, Relation count | yes; pluralization |
| `src/App.tsx` | `New Dataset ready.` | New Dataset created | none | no |
| `src/App.tsx` | `Draft coordinates are already active, but this Dataset does not match LiaisonScape's writable legacy Draft profile.` | Draft migration unavailable | none | no |
| `src/App.tsx` | `Coordinates remain temporary because the existing Coordinate or Specification payload is not safely writable.` | Coordinate save refused | none | no |
| `src/App.tsx` | `Entity coordinates saved to the experimental Coordinate payload.` | Coordinate save succeeds | none | no |
| `src/App.tsx` | `Coordinate migration is unavailable (${code} at ${path}).` | Prototype → Draft migration refused | diagnostic code, path | yes |
| `src/App.tsx` | `Coordinate Prototype migrated to Coordinate Draft 0.1.0.` | Prototype → Draft migration succeeds | version is currently fixed | possibly |
| `src/App.tsx` | `Space migration is unavailable (${code} at ${path}).` | Space migration refused | diagnostic code, path | yes |
| `src/App.tsx` | `Linkscape coordinates migrated to LiaisonScape.` | Space migration succeeds | none | no |
| `src/App.tsx` | `Legacy migration is unavailable (${code} at ${path}).` | Legacy migration refused | diagnostic code, path | yes |
| `src/App.tsx` | `Legacy Linkscape coordinates migrated to LiaisonScape.` | Legacy migration succeeds | none | no |
| `src/App.tsx` | `Relation ${id} cannot be updated: relation_not_found` | Selected Relation is missing | Relation ID, refusal code | yes |
| `src/App.tsx` | `Relation ${id} cannot be updated: ${refusal}` | Relation update refused | Relation ID, refusal reason | yes |
| `src/App.tsx` | `Relation ${id} updated.` | Relation update succeeds | Relation ID | yes |
| `src/App.tsx` | `Entity ${id} created.` | Entity creation succeeds | Entity ID | yes |
| `src/App.tsx` | `Relation not created: ${refusal}` | Relation creation refused | refusal reason | yes |
| `src/App.tsx` | `Relation ${id} created.` | Relation creation succeeds | Relation ID | yes |
| `src/App.tsx` | `Relation cannot be deleted: ${reason}` | Relation deletion refused | refusal reason | yes |
| `src/App.tsx` | `Entity cannot be deleted because ${count} Relation(s) reference it. Remove those Relations first.` | Entity deletion blocked by incidents | incident Relation count | yes; pluralization |
| `src/App.tsx` | `Entity cannot be deleted: ${reason}` | Entity deletion refused | refusal reason | yes |
| `src/App.tsx` | `Relation cannot be deleted: ${reason}` | Relation deletion result refused | refusal reason | yes |
| `src/App.tsx` | `Relation ${id} deleted.` | Relation deletion succeeds | Relation ID | yes |
| `src/App.tsx` | `Entity cannot be deleted: ${reason}` | Entity deletion result refused | refusal reason | yes |
| `src/App.tsx` | `Entity ${id} deleted.` | Entity deletion succeeds | Entity ID | yes |
| `src/App.tsx` | `Entity ${id} updated.` | Entity update succeeds | Entity ID | yes |
| `src/App.tsx` | `Export blocked: the Dataset has validation errors.` | Export refused | diagnostics exist | no, but validation formatter later |
| `src/App.tsx` | `Exporting with validation warnings.` | Export proceeds with warnings | warning count is currently not embedded | possibly |

Dynamic/result entries in this category: **30**.

High-priority formatter groups are count summaries, object-ID results,
refusal reasons, diagnostic code/path pairs, and incident Relation counts.
Refusal reasons currently come from domain/service result values and must be
mapped deliberately rather than displayed as raw English codes.

## C. Validation, open, export, and diagnostics

The following user-facing English is covered by the dynamic inventory above:

- JSON parse failure with parser reason;
- invalid Dataset summary;
- loaded Entity/Relation count summary;
- export blocked by validation errors;
- export warning status;
- diagnostic code/path in migration refusal messages.

The validation diagnostics list itself is rendered from validator diagnostics
and may contain diagnostic `code`, `path`, `severity`, and related IDs. These
values are structured diagnostic data, not translation strings. A later human-
readable diagnostic formatter should translate the surrounding explanation
without translating diagnostic codes.

## D. Entity deletion refusal and stale-object boundaries

| Source | Current English text | Trigger | Dynamic values | Formatter needed |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | `Entity cannot be deleted because ${count} Relation(s) reference it. Remove those Relations first.` | Incident Relations block deletion | incident Relation count | yes; pluralization |
| `src/App.tsx` | `Entity cannot be deleted: ${reason}` | stale/missing/unsafe deletion result | domain refusal reason | yes |
| `src/App.tsx` | `Relation cannot be deleted: ${reason}` | stale/missing/unsafe Relation deletion | domain refusal reason | yes |
| `src/components/EntityDetailDialog.tsx` | `This Entity is connected by ${count} Relation(s). Delete those Relations before deleting this Entity.` | Entity Detail danger zone with incidents | incident Relation count | yes; pluralization |
| `src/components/EntityDetailDialog.tsx` | `Related Relations:` | Entity Detail danger zone | none | no |

Entries in this category: **5**. The same incident/deletion concept appears in
both status messages and the Entity Detail dialog and should share terminology
and pluralization rules.

## E. Migration result messages

| Source | Current English text | Trigger | Dynamic values | Formatter needed |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | `Draft coordinates are already active, but this Dataset does not match LiaisonScape's writable legacy Draft profile.` | Draft migration unavailable | none | no |
| `src/App.tsx` | `Coordinate migration is unavailable (${code} at ${path}).` | Coordinate migration refusal | diagnostic code, path | yes |
| `src/App.tsx` | `Coordinate Prototype migrated to Coordinate Draft 0.1.0.` | Coordinate migration success | version | possibly |
| `src/App.tsx` | `Space migration is unavailable (${code} at ${path}).` | Space migration refusal | diagnostic code, path | yes |
| `src/App.tsx` | `Linkscape coordinates migrated to LiaisonScape.` | Space migration success | none | no |
| `src/App.tsx` | `Legacy migration is unavailable (${code} at ${path}).` | Legacy migration refusal | diagnostic code, path | yes |
| `src/App.tsx` | `Legacy Linkscape coordinates migrated to LiaisonScape.` | Legacy migration success | none | no |

Migration result entries: **7**.

## F. Event endpoints and unsupported graph messages

No dedicated explanatory English status message for Event-endpoint Relations
was found in the current rendered Workspace path. Event-endpoint Relations are
handled by graph omission/diagnostic behavior and preservation logic. Any
future user-facing explanation should be added as a separately designed
message, not inferred from raw diagnostic codes.

## G. Dialog strings

### Entity Detail — `src/components/EntityDetailDialog.tsx`

- `Close`
- `Entity Detail`
- `ID`
- `Shown Relations`
- `Dataset Relations`
- `Name`
- `Description`
- `Save Entity`
- `Danger zone`
- `This Entity is connected by ${count} Relation(s). Delete those Relations before deleting this Entity.`
- `Related Relations:`
- `Delete Entity`

### Relation Detail — `src/components/RelationDetailDialog.tsx`

- `Close`
- `Relation Detail`
- `Source`
- `Target`
- `ID`
- `Name`
- `Description`
- `Save Relation`
- `Danger zone`
- `Delete Relation`

### Creation Dialog — `src/components/CreationDialog.tsx`

- `Create ${mode}` (accessible label)
- `Create Entity`
- `Create Relation`
- `Source Entity`
- `Select source`
- `Target Entity`
- `Select target`
- `Name`
- `Description`
- `Cancel`
- `Save Entity`
- `Save Relation`

### Confirmation Dialog — `src/components/ConfirmationDialog.tsx`

- `Cancel deletion` (backdrop accessible label)
- `Confirm deletion`
- `Delete this ${subject}?`
- `Cancel`
- `Delete`

Dialog fixed/dynamic entries: **32** unique entries, including the two
interpolated labels/questions. Dataset-authored Entity/Relation names shown in
select options and related-Relation buttons are excluded from translation.

## H. Context menu strings

| Source | Current English text | Trigger | Kind |
| --- | --- | --- | --- |
| `src/App.tsx` | `Add Entity` | Blank-canvas context menu | fixed |
| `src/App.tsx` | `Cancel` | Blank-canvas context menu | fixed |

Context menu visible entries: **2**. Entity/Relation detail context actions
reuse existing detail opening behavior and do not have separate visible menu
labels in the current JSX path.

## I. Accessibility-only strings

| Source | Current text | Target |
| --- | --- | --- |
| `src/App.tsx` | `Guides` | Home guide navigation |
| `src/App.tsx` | `Canvas actions` | Canvas context menu |
| `src/App.tsx` | `Dataset metadata` | Dataset metadata definition list |
| `src/App.tsx` | `Validation diagnostics` | Diagnostics list |
| `src/App.tsx` | `Graph view controls` | Viewport toolbar |
| `src/App.tsx` | `Move zoom controls` | Floating toolbar drag handle |
| `src/App.tsx` | `Close Entity Detail` | Entity Detail backdrop |
| `src/components/EntityDetailDialog.tsx` | `entity-detail-title` reference | Entity Detail dialog labelling target |
| `src/components/RelationDetailDialog.tsx` | `Close Relation Detail` | Relation Detail backdrop |
| `src/components/RelationDetailDialog.tsx` | `relation-detail-title` reference | Relation Detail dialog labelling target |
| `src/components/CreationDialog.tsx` | ``Create ${mode}`` | Creation dialog accessible label |
| `src/components/ConfirmationDialog.tsx` | `Confirm deletion` | Confirmation dialog label |
| `src/components/ConfirmationDialog.tsx` | `Cancel deletion` | Confirmation backdrop label |
| `src/App.tsx` | `Entity relationship graph` | Graph SVG accessible label; currently dictionary-backed |

Accessibility-only inventory entries: **13**. ID references such as
`entity-detail-title` are structural values rather than visible translations,
but are listed so the future accessibility pass does not omit them.

## Summary

1. Remaining visible fixed strings not yet dictionary-backed: **6**.
2. Remaining dynamic status/result messages: **30**.
3. Remaining Dialog/context visible strings: **34** (32 Dialog + 2 context menu).
4. Accessibility-only entries: **13**.
5. Typed formatter candidates:
   - Entity/Relation count summaries;
   - object ID success messages;
   - refusal reasons from domain results;
   - diagnostic code/path messages;
   - incident Relation counts and singular/plural wording;
   - interpolated dialog labels and confirmation questions;
   - parser/validator error reasons;
   - warning/error summaries.
6. Recommended next smallest implementation unit: **remaining visible fixed
   Workspace selection/editing labels** (`Edit Entity`, `Edit Relation`, and
   the curvature hint), with no dynamic messages or
   dialogs in the same change. After that, handle dynamic status messages as a
   separate typed-formatter workstream.

## Verification

This pass added only this inventory document. No production behavior or
source code was changed. `git diff --check` should be run after the document
is reviewed.
