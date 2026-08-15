# Future Workstream: LiaisonScape Home / Entry UX

Status: Planned before first distribution; not implemented

This is a future product UX workstream for first-distribution preparation. It
is independent of Direct Graph Authoring and does not authorize production
behavior changes during the current decision pass.

## Motivation

LiaisonScape should not send first-time users directly into an import-focused
editing surface. Its entry experience should explain what the application is
for before asking users to operate it.

The first impression should describe LiaisonScape as an Entity-and-Relation
relationship explorer for creating, viewing, and editing relationship graphs.
The current developer-friendly Import-first start state does not communicate
that purpose clearly enough to a first-time user.

## LiaisonScape Home minimum responsibilities

The future Home / entry page should:

- briefly explain LiaisonScape as a relationship explorer for Entity and
  Relation graphs;
- provide an action to start a new Dataset;
- provide an action to open or import an existing E2R Dataset;
- link to the Japanese user guide;
- link to the English user guide;
- make the transition into the current graph workspace explicit;
- avoid implying that Event editing or unsupported semantic features are part
  of the LiaisonScape MVP.

The existing editing workspace, Add Entity/Add Relation controls, Dataset
import, and export behavior remain the workspace concerns. Home should be an
entry boundary, not a second editor.

## New Dataset entry

The Home should offer a clear new-Dataset action. Its exact Dataset creation
defaults require a separate implementation decision, but the action should
lead to a valid self-contained E2R Dataset without inventing unnecessary
Entities, Events, Relations, Coordinates, or Extensions.

The entry flow should distinguish:

- starting a new Dataset;
- opening/importing an existing Dataset; and
- continuing into the graph workspace after a Dataset is available.

## E2R application portal

In addition to the LiaisonScape Home, the E2R application family should have a
small portal page from which users can choose between:

- NarrativeLine — the timeline-oriented Event editor; and
- LiaisonScape — the Entity/Relation relationship explorer.

The portal should explain the complementary roles without suggesting that the
two applications have identical workflows. It should provide direct links or
launch actions to both applications and may link to shared E2R documentation.

The portal is an application entry and navigation concern. It must not become
a new E2R Core or Extension concept.

## Relationship to other workstreams

This workstream is separate from:

- Direct Graph Authoring;
- Relation Arrow Appearance;
- Relation Endpoint Editing;
- Coordinate/migration compatibility; and
- the E2R Core specification.

Direct Graph Authoring improves in-workspace authoring scalability. Home /
Entry UX explains the product and helps users reach the workspace. Neither
should be used to expand the other's scope.

## Future acceptance inventory

Before first distribution, a separate test and browser acceptance pass should
confirm:

- first launch opens Home rather than the editing workspace;
- LiaisonScape purpose is understandable without developer context;
- New Dataset enters a valid empty or explicitly designed starting Dataset;
- Open/Import reaches the existing Dataset validation boundary;
- Japanese and English guide links work;
- Home can reach the current graph workspace;
- portal navigation reaches both NarrativeLine and LiaisonScape;
- browser back/navigation does not silently discard an active Dataset;
- unsupported Event editing is not implied by the entry copy;
- existing workspace authoring and import regressions remain green.

## Decision boundary

This document records the planned workstream only. It does not decide the
visual design, routing technology, new-Dataset defaults, hosting arrangement,
shared portal ownership, or production implementation structure. Those choices
belong to a later Home / Entry UX Inventory and Decision Pass.
