# LiaisonScape i18n MVP Closure

## Scope

The LiaisonScape i18n MVP supports English and Japanese through a typed application-owned dictionary, App-level locale propagation, browser-language detection, persisted locale preference, and document language updates.

Completed areas include the Home and Workspace UI, dialogs, fixed controls, context menus, accessibility labels, Graph Workspace presentation, Dataset metadata, load counts, selected-state and graph count formatters, import/open errors, authoring refusals, export warnings/errors, Browser Back preservation notices, Coordinate save and migration feedback, and validation diagnostic presentation labels.

## Translation boundary

Application-owned presentation text is localized. Dataset-authored names and descriptions, Entity/Event/Relation IDs, diagnostic codes and paths, Extension IDs, Coordinate and Specification identifiers, persisted compatibility identifiers, and the product name `LiaisonScape` remain unchanged.

Japanese terminology uses `エンティティ`, `つながり`, `できごと` for general-user Event notices, and keeps technical terms such as `Dataset`, `Core`, `Extension`, `Coordinate`, `Coordinate Draft`, and `Specification` where appropriate.

## UX decisions

- Redundant create/update/delete success notifications were removed.
- The Coordinate Draft completed normal-state status was removed; migration readiness and disabled controls remain unchanged.
- Raw parser, authoring refusal, and migration code/path values are not shown in general status messages.
- Validation diagnostics retain technical code/path values with localized severity and `Code`/`Path` presentation labels.
- Generic diagnostic explanations, code-specific friendly mappings, related-ID presentation, and advanced diagnostic details remain deferred.
- Oversized button text and borders in LiaisonScape and NarrativeLine remain a future visual polish item.

## Intentional exclusions and follow-ups

Deferred follow-ups include code-specific diagnostic explanations, advanced technical diagnostics, related-ID presentation, Legacy migration UX redesign or retirement, dormant string cleanup, broader navigation redesign, and additional locales.

The i18n workstream does not change Dataset semantics, Core objects, authoring behavior, relation endpoint behavior, graph behavior, Coordinate semantics, migration transformations, Validator semantics, navigation architecture, or export serialization.

## Verification

- 121 tests passed
- typecheck/lint passed
- production build passed
- `git diff --check` passed

`I18N MVP RESIDUAL STRING AUDIT CLEAR`

`READY FOR I18N MVP CLOSURE`

`LIAISONSCAPE I18N MVP COMPLETE`
