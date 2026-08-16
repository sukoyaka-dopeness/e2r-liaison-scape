# LiaisonScape User Guide

LiaisonScape is an application for viewing and editing the Entities and
connections in an E2R Dataset as a graph. This guide explains the basic
operations from a user's point of view without requiring prior knowledge of
the E2R specification.

## Terms used in this guide

- Dataset: a collection of Entities and connections.
- Entity: a person, organization, place, object, or other thing represented in
  the graph as a node.
- Relation: a connection from one Entity to another. A Relation has a
  direction.
- Node: the visual representation of an Entity in the graph.
- Connection line: the line that displays a connection between Entities.

## Start from Home

Home provides the following actions:

- `New Dataset`: create an empty Dataset.
- `Open E2R Dataset`: open an E2R JSON file from your device.
- `Open sample Dataset`: open the sample for the current locale.
- `English`: switch the display language.
- `Credits`: view the application credits.

For a first visit, choose `Open sample Dataset`. In the English locale this
opens the `Lighthouse Restoration Project`, which is designed to demonstrate
the graph and editing features.

## Open a Dataset

Choose `Open E2R Dataset` and select an E2R JSON file. After a successful load,
Entities appear as nodes and connections between Entities appear as lines.

The English sample is available from Home through the current locale. A
Relation connected to an Event remains in the Dataset, but it is not displayed
as an Entity-to-Entity connection in the current graph view.

## Explore the graph

- Click or tap the body of a node to select its Entity.
- Click or tap an Entity name or description to open that Entity's details.
- Click or tap a connection line to select that Relation. Drag the selected
  line to temporarily adjust its curve.
- When a connection has a name, that name is shown near the line. This is the
  connection name.
- Click or tap a connection name to open that Relation's details.
- The arrow on a connection line shows the connection's direction.
- Drag the graph background to pan the visible area.
- Drag an Entity name or description to adjust its displayed label position.
  This changes the current view only and is not saved as a node Coordinate.

The initial position of a node without a saved position is assigned for
display. This assignment alone does not modify the Dataset.

## Pan and zoom

- Hold `Ctrl` while scrolling the mouse wheel upward to zoom in.
- Hold `Ctrl` while scrolling the mouse wheel downward to zoom out.
- Use the toolbar's `Zoom in` and `Zoom out` buttons for the same operation.
- Use `Reset view` to return to the initial fitted view.

The toolbar can be moved within the graph area when needed. Zoom, pan,
selection, and other temporary view state are separate from the Dataset.

## Create and edit Entities

### Create an Entity

Choose `Add Entity`, enter a name and description, and choose `Create Entity`.
An empty name is allowed, but a descriptive name makes the graph easier to
understand.

### Edit an Entity

Select the Entity name or description to open `Entity Detail`. Edit `Name` or
`Description`, then choose `Save Entity`.

### Delete an Entity

Delete an Entity from its detail view. An Entity with connected Relations
cannot be deleted; remove or review those Relations first. Cascade deletion is
not performed.

## Create and edit Relations

### Create a Relation

Choose `Add Relation`, select the `Source Entity` and `Target Entity`, enter an
optional name and description, and choose `Save Relation`.

A Relation has a direction from its source to its target. To create the
opposite direction, exchange the source and target selections.

The same Entity may be selected as both endpoints. Multiple Relations may also
connect the same pair of Entities.

### Edit a Relation

Click or tap a connection name to open `Relation Detail`. For an
Entity-to-Entity Relation, edit `Source Entity` or `Target Entity` as needed.
You can also edit `Name` and `Description`, then choose `Save Relation`.

### Delete a Relation

Delete a Relation from `Relation Detail`.

## Direct graph authoring

The graph also provides direct authoring actions:

- On a mouse or trackpad, right-click an empty graph area and choose `Add
  Entity` from the context menu.
- On a touch device, long-press an empty graph area to open the same action
  menu.
- Drag from the small connection port at the edge of one node to another node
  to begin creating a Relation. Release on the target node, enter the name and
  description, and save it.
- Right-click a node or connection to open its detail view. On a touch device,
  long-press the node or connection for the equivalent action where supported.

Direct authoring is confirmed only when the creation or detail action is
completed and saved. Temporary in-progress operations do not immediately
become Dataset data.

## Move nodes and save positions

Drag a node to change its position in the current graph. Moving a node alone
does not necessarily save its position in the Dataset.

To persist moved node positions, choose `Save node coordinates`. If the
Dataset's existing Coordinate information cannot be updated safely, LiaisonScape
keeps the moved positions temporary and shows a message explaining that they
were not saved. Follow that message rather than assuming that the move was
persisted.

Connection curves and displayed label positions are view settings separate
from saved node positions.

## Export a Dataset

Choose `Export E2R JSON` to validate and download the current Dataset.

Export may be blocked when validation finds a problem. Review the displayed
message and correct the relevant Entity or Relation before trying again.

Saved Entity and Relation edits and saved node coordinates are included in the
export. Temporary unsaved node positions, zoom, pan, selection, connection
curves, label positions, and other view state are not exported as Dataset data.

## Current MVP scope

The current MVP supports:

- creating, editing, and deleting Entities;
- creating, editing, and deleting Entity-to-Entity Relations;
- changing Relation source and target endpoints;
- a Relation from an Entity to itself;
- multiple Relations between the same pair of Entities;
- direct graph authoring;
- moving nodes and explicitly saving node coordinates; and
- exporting the Dataset.

The following are outside the current graph-authoring scope:

- Event nodes;
- creating, editing, or deleting Events;
- Undo and Redo; and
- advanced Relation appearance or other post-MVP features.
