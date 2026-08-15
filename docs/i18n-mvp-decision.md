# LiaisonScape i18n MVP Inventory / Decision Pass

Status: `READY FOR TEST-FIRST I18N IMPLEMENTATION`

This document is the decision checkpoint before implementing Japanese and
English UI localization. It does not authorize translation implementation.

## Scope

The localization inventory covers all LiaisonScape user-facing application
strings, not only Home:

- Home / Entry and guide actions;
- Header and Footer;
- Workspace toolbar and graph actions;
- Add Entity / Add Relation;
- Entity Detail and Relation Detail;
- Creation, Confirmation, and deletion dialogs;
- canvas and Entity/Relation context menus;
- Relation curvature discoverability hint;
- Coordinate save controls and messages;
- migration controls and migration results;
- Open / Export validation and status messages;
- success, refusal, error, and empty-state messages;
- human-readable validator results;
- `aria-label`, dialog labels, menu roles, and other accessibility text.

## Translation boundary

Translate application-owned presentation and interaction text:

- operation labels;
- headings and explanations;
- status, confirmation, refusal, and error messages;
- accessibility labels and instructions.

Do not translate or rewrite Dataset data:

- user-authored Entity/Event/Relation `name` and `description`;
- Core Object IDs;
- Extension IDs;
- Coordinate Space IDs;
- diagnostic codes;
- Product names such as LiaisonScape.

Locale is Application View State / Application preference. It must never be
stored in an E2R Dataset, Coordinate, Layout, or Perspective payload.

## E2R terminology decision

The UI keeps the E2R concept names visible and consistent across the sibling
applications:

| Concept | English UI | Japanese UI |
| --- | --- | --- |
| Dataset | Dataset | Dataset |
| Entity | Entity | Entity |
| Relation | Relation | Relation |
| Event | Event | Event |

Japanese explanatory text may use Japanese prose, but the E2R concept names
remain recognizable and are not replaced by unrelated application-specific
terms.

## Locale behavior

- Supported locales: `en` and `ja`.
- Initial locale: Japanese when the browser language is Japanese; English
  otherwise.
- A user-selected locale is stored in `localStorage` as an Application
  preference.
- Home, Workspace, dialogs, menus, and messages use the same active locale.
- Locale changes apply immediately.
- `document.documentElement.lang` follows the active locale.
- Locale preference is not included in exported Dataset JSON.

## Architecture decision

Use a small internal typed dictionary rather than adding an i18n dependency at
MVP stage. Keep message definitions outside `App.tsx`, grouped by application
area. Dynamic messages must use typed formatting helpers rather than ad hoc
string concatenation.

The dictionary must support:

- interpolation of IDs and counts;
- plural-sensitive messages where needed;
- validation and migration result descriptions;
- accessibility labels separate from visible labels where wording differs.

## Dynamic-message inventory

Before implementation, identify and test messages containing:

- Entity / Relation counts;
- created, updated, deleted, and refused object IDs;
- validation warning and error counts;
- import/open and export outcomes;
- migration success and refusal reasons;
- incident Relation explanations for blocked Entity deletion;
- unsupported Event-endpoint and graph rendering explanations.

## Test boundary

The implementation workstream must verify:

- English preserves the current meaning;
- Japanese switching works from Home and Workspace;
- Home → Workspace preserves locale;
- dialogs and context menus use the active locale;
- reload restores the Application preference;
- locale switching does not mutate Dataset data;
- selection, positions, and active Dataset remain unchanged;
- exported JSON is identical before and after locale switching;
- accessibility labels follow the active locale.

## Out of scope

- translation of Dataset-authored content;
- Core or Extension changes;
- Coordinate or Perspective changes;
- browser-history/navigation architecture;
- new UI capabilities;
- NarrativeLine localization implementation in this workstream.

NarrativeLine is a terminology comparison target for shared E2R vocabulary,
not a second implementation target for this decision pass.
