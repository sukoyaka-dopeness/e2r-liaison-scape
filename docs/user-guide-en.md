# LiaisonScape User Guide

LiaisonScape is an E2R relationship explorer for viewing and lightly editing connections between Entities in an E2R Dataset.

## Open a Dataset

1. Choose an E2R JSON file with the file picker.
2. LiaisonScape validates its Core structure.
3. For a valid Dataset, Entities appear as nodes and Entity-to-Entity Relations appear as edges.

Relations with an Event endpoint are not shown in the Entity-first MVP graph. Their data is not deleted and remains available on export.

When the Metadata Extension contains a `title` or `datasetId`, LiaisonScape displays it as Dataset information. A Dataset remains valid without these values, and opening it does not cause LiaisonScape to generate an ID.

## Explore the graph

- Click or tap a node to open Entity Detail in a modal over the graph.
- Click or tap an edge line to select it and reveal its curve handle.
- Click or tap an edge label to open Relation Detail in a modal over the graph. For an unnamed Relation, select its line and use `Edit Relation`.
- Close a Detail modal with its `Close` button, the shaded background, or the Escape key.
- Select an edge, then drag its purple curve handle to adjust its route temporarily. For a self-Relation, the drag direction rotates the loop and the drag distance changes its size.
- A manually adjusted edge keeps its route while nodes move. Choose `Use automatic route` to return that edge to automatic routing.
- Drag an edge label freely in any direction. Choose `Use automatic label position` to return it to collision-aware automatic placement.
- Hover over graph objects to view available supporting information.
- A Relation arrow follows the structural direction from Core `sourceId` to `targetId`. It does not automatically mean causality, ownership, chronology, or another domain interpretation.

LiaisonScape automatically places nodes and routes edges to reduce overlap. Automatic display calculations do not modify the Dataset.

## Pan and zoom

- Drag graph space or an edge to pan.
- Use the mouse wheel, `Zoom in`, or `Zoom out` to change scale.
- On a phone, use one finger to pan and two fingers to pinch zoom.
- `Reset view` fits the current nodes into view and clears selection and manual label positions.

## Move nodes

Drag a node to change its position. A moved coordinate remains temporary at first.

Choose `Save node coordinates` to write moved Entity positions to the unregistered E2R Coordinate interoperability prototype. LiaisonScape defines a logical legacy `linkscape-graph` Space at Dataset level and writes component-keyed `x` and `y` values for Entities. If an earlier Linkscape `extensions.coordinate.positions` value exists, explicit save migrates the `linkscape` position while preserving unrelated legacy values. If the Dataset already contains an unsupported Coordinate version, an incompatible or duplicate `linkscape-graph` claim, or a Specification declaration that LiaisonScape cannot maintain safely, it leaves the positions temporary and reports that it did not save them. Compatible extra Components and unknown fields are preserved when `x` and `y` are updated. Edge curvature and label positions are not included.

For an exact supported Prototype Dataset, choose `Migrate Coordinate to Draft` to perform an explicit, atomic migration to Coordinate Draft `0.1.0`. The complete target is validated before the Prototype payload is removed; refusal leaves the original Dataset untouched. LiaisonScape restores exact supported Draft positions when the Dataset is opened again and saves moved positions back to the same exact writable legacy Draft profile. Opening, panning, zooming, ordinary coordinate saving, or exporting never performs this migration.

## Edit an Entity

1. Select a node.
2. Edit `Name` or `Description` in Entity Detail.
3. Choose `Save Entity`.

The graph label updates from the saved name and description. Saving an empty value removes that optional field. IDs, unknown fields, and unknown Extensions remain preserved.

## Edit a Relation

1. Select an edge.
2. Edit `Name` or `Description` in Relation Detail.
3. Choose `Save Relation`.

A Relation `Name` appears as a horizontal edge label. It is a human-readable Core label, not a semantic Relation type.

## Move labels

- Drag an Entity name and description together to place the label freely.
- The connector disappears when an Entity label is inside or close to its icon.
- Drag a Relation label to move it to the nearest point along its edge.

Manual label positions belong only to the current LiaisonScape view. They are not saved to the Dataset and are cleared by `Reset view` or re-import.

## Export

Choose `Export E2R JSON` to validate and download the current Dataset.

Saved Entity and Relation edits and saved coordinates are exported. Zoom, pan, selection, manual edge curvature, manual label positions, and display layer order are not exported. Unknown fields and unknown Extensions remain preserved whenever practical.

## Current MVP limitations

- Event nodes and Event editing are not supported.
- Relation deletion and endpoint editing are not supported. Entity and
  Entity-to-Entity Relation creation are supported through the Add actions.
- Semantic Relation types, arrow presentation modes, and persistent layer order are not supported.
- Manual edge curvature and label positions are not stored in the Dataset.
- The Coordinate payload is an authority-qualified `0.1.0` experiment, not a registered Stable Extension. Layout standardization also remains future work.
