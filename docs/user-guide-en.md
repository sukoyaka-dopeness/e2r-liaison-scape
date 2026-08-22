# LiaisonScape User Guide

LiaisonScape is an application for viewing and editing the relationships in an
E2R Dataset as a graph. You can explore a relationship map, add and edit the
people, organizations, places, and other things in it, and save the result as
an E2R Dataset. This guide is organized around those user goals rather than
screen names.

## What are Entities and Relations?

- Dataset: E2R data that can include Events, Entities, and Relations. In
  LiaisonScape, the current graph view focuses on Entities and
  Entity-to-Entity Relations.
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
- `日本語`: switch the display language.
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

## Explore the relationship map

- Click or tap the body of a node to select its Entity.
- Click or tap an Entity name or description to select its parent Entity.
- Click or tap a connection line to select that Relation.
- When a connection has a name, that name is shown near the line. This is the
  connection name.
- Click or tap a connection name to select its parent Relation.
- The arrow on a connection line shows the connection's direction.
- Drag the graph background to pan the visible area.

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

Alternatively, open the context menu on an empty graph area and choose `Add
Entity`. Use right-click on a mouse or trackpad, or long-press on touch.

### Edit an Entity

Select the Entity, then use the available detail action to open `Entity Detail`.
Edit `Name` or `Description`, then choose `Save Entity`.

Alternatively, open the Entity context menu with right-click or long-press and
choose `Open details`.

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

Alternatively, drag from a node's connection port to another node, release on
the target, then complete and save the creation form.

### Edit a Relation

Select the Relation, then use the available detail action to open `Relation
Detail`. For an Entity-to-Entity Relation, edit `Source Entity` or `Target
Entity` as needed. You can also edit `Name` and `Description`, then choose
`Save Relation`.
A Relation can be selected from its path or label. Open its context menu with
right-click or long-press and choose `Open details` when needed.

### Delete a Relation

Delete a Relation from `Relation Detail`.

## Move nodes and save positions

Drag a node to change its position in the current graph. Moving a node alone
does not necessarily save its position in the Dataset.

To persist moved node positions, choose `Save node coordinates`. If the
Dataset's existing Coordinate information cannot be updated safely, LiaisonScape
keeps the moved positions temporary and shows a message explaining that they
were not saved. Follow that message rather than assuming that the move was
persisted.

Connection curves and displayed label positions are view settings separate
from saved node positions. Manual route and label placement is pending view
work and is not saved by `Save node coordinates`.

## Adjust labels and connection routes

Drag a node label to place that label manually. Drag a connection line to
adjust its route; the drag starts by selecting that Relation, so prior
selection is not required. Drag a connection name to place its label manually.
These are pending view-placement work and are not saved by `Save node
coordinates`. Open the relevant context menu with right-click or long-press
and choose `Return to automatic placement` to reset manual placement.

For Entity labels, connection routes, and connection labels, LiaisonScape can
indicate whether the placement is automatic or user-placed. This helps you
tell which parts of the map you have arranged yourself.

## Export a Dataset

Choose `Export E2R JSON` to validate and download the current Dataset.

Export may be blocked when validation finds a problem. Review the displayed
message and correct the relevant Entity or Relation before trying again.

Saved Entity and Relation edits and saved node coordinates are included in the
export. Temporary unsaved node positions, zoom, pan, selection, connection
curves, label positions, and other view state are not exported as Dataset data.

## Replace a Dataset safely

When you open a local Dataset, open the sample, or create a New Dataset, the
current Dataset is replaced only after the operation has produced a valid
candidate. If the current Dataset contains work that could be lost, a
replacement confirmation is shown.

The available actions depend on the current work:

- `Cancel` keeps the current Dataset and work.
- `Discard and Continue` discards unsaved work and opens the candidate.
- `Export and Continue` is available for modified Dataset content. It exports
  the current Dataset successfully before opening the candidate.
- `Export Dataset` is available when modified content and pending work are
  both present. It exports the current Dataset's exportable content, but does
  not commit pending work or open the staged candidate. The current Dataset,
  pending work, and candidate remain in place.

If there is no work at risk, replacement can proceed immediately. Invalid
JSON or a Dataset that fails validation does not replace the current Dataset.

## Browser reload and close protection

When unsaved Dataset changes or pending work could be lost, the browser may
show its native warning when you reload, close the page, or leave the document.
The exact wording and controls depend on the browser. This warning does not
mean that every temporary view change is saved; it indicates that work may
still need to be exported or completed.

## Share a relationship map with a link

Dataset Handoff lets you share a relationship map you created as a link. You
can publish the link on social media or a website so other people can open and
explore the map without first downloading a JSON file and importing it
manually. LiaisonScape does not host the Dataset or post to social media; the
Dataset must already be available at a public HTTPS URL.

When someone opens the link, LiaisonScape obtains the published Dataset at
startup and opens the relationship map.

### Requirements for creating a Handoff link

LiaisonScape can open a public Dataset at startup when the URL contains a
fragment in this form:

```text
#datasetUrl=<percent-encoded absolute HTTPS URL>
```

The remote resource must be publicly reachable over HTTPS and allow the
browser request through CORS. Private or authenticated resources are outside
this v0 behavior. Handoff is processed at startup only; changing the fragment
later does not switch the open Dataset.

If the handoff URL is invalid, cannot be fetched, contains invalid JSON, or
contains a Dataset that fails validation, LiaisonScape shows a failure on Home
and does not silently open a sample or another Dataset.

After a successful handoff, the `datasetUrl` fragment remains as a reference
to where the Dataset was obtained. It is not the Dataset's identity and does
not represent current unexported edits or view state. If you successfully
replace the handed-off Dataset with a local Dataset, the sample, or a New
Dataset, LiaisonScape removes only `datasetUrl` and preserves unrelated
fragment parameters.

## Validation messages

When opening or exporting a Dataset, LiaisonScape checks its consistency.
If there is a problem, review the displayed message and correct the relevant
Entity or Relation. Information that LiaisonScape does not use for display is
preserved as far as possible when the Dataset is loaded and saved.

## Future possibilities

The following are areas under consideration or planned exploration, not
committed features:

- organizing related Entities into groups to make large graphs easier to read;
- comparing multiple Datasets and making related Datasets easier to handle;
- strengthening connections with the Hub and other E2R applications;
- improving readability of larger graphs through automatic placement and
  richer visual presentation such as colors or icons; and
- supporting richer Dataset information, such as time expressions, sources,
  citations, and external identifiers.

AI-assisted analysis, validation, and authoring support are also research
topics for the future.
