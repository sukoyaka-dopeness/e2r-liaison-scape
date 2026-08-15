import { useEffect, useMemo, useRef, useState } from "react";
import { assessCoordinateDraftMigration, migrateCoordinatePrototypeToDraft } from "./coordinate-migration";
import { assessLiaisonScapeSpaceMigration, migrateLinkscapeSpaceToLiaisonScape } from "./space-migration";
import { assessLegacyLinkscapeCoordinateMigration, migrateLegacyLinkscapeCoordinatesToLiaisonScape } from "./legacy-migration";
import { applyStoredCoordinates, buildEntityGraph, getStoredCoordinates, type Dataset, type Diagnostic, type GraphNode } from "./dataset";
import { getDatasetMetadata, loadDataset, serializeDataset, validateDatasetForExport } from "./services/DatasetService";
import { assessEntityDeletion, createEntity, deleteEntity } from "./services/EntityService";
import { getEntityDetail, updateEntityDetails } from "./services/EntityService";
import { assessRelationDeletion, createRelation, deleteRelation } from "./services/RelationService";
import { getRelationDetail, updateRelation } from "./services/RelationService";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { EntityDetailDialog } from "./components/EntityDetailDialog";
import { RelationDetailDialog } from "./components/RelationDetailDialog";
import { CreationDialog } from "./components/CreationDialog";
import { bringToFront, centeredViewportTransform, clampScale, fitGraphView, placeEdgeLabel, placeNodeLabel, pinchZoomScale, routeGraphEdge, shouldShowNodeLabelConnector, truncateNodeText, type LabelRect, zoomScale } from "./viewport";

const emptyDataset: Dataset = { version: "1.0", entities: [], events: [], relations: [] };

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [message, setMessage] = useState("Import an E2R Dataset to begin.");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entityNameDraft, setEntityNameDraft] = useState("");
  const [entityDescriptionDraft, setEntityDescriptionDraft] = useState("");
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [relationNameDraft, setRelationNameDraft] = useState("");
  const [relationDescriptionDraft, setRelationDescriptionDraft] = useState("");
  const [relationSourceDraft, setRelationSourceDraft] = useState("");
  const [relationTargetDraft, setRelationTargetDraft] = useState("");
  const [nodeLayerOrder, setNodeLayerOrder] = useState<string[]>([]);
  const [edgeLayerOrder, setEdgeLayerOrder] = useState<string[]>([]);
  const [nodeLabelOffsets, setNodeLabelOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [edgeLabelOffsets, setEdgeLabelOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [edgeCurveOffsets, setEdgeCurveOffsets] = useState<Record<string, number>>({});
  const [selfLoopOverrides, setSelfLoopOverrides] = useState<Record<string, { orientation: number; radius: number }>>({});
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [coordinatesDirty, setCoordinatesDirty] = useState(false);
  const [creationMode, setCreationMode] = useState<"entity" | "relation" | null>(null);
  const [creationName, setCreationName] = useState("");
  const [creationDescription, setCreationDescription] = useState("");
  const [creationSource, setCreationSource] = useState("");
  const [creationTarget, setCreationTarget] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState<"entity" | "relation" | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const dragRef = useRef<{ kind: "canvas" | "node" | "edge" | "node-label" | "edge-label" | "edge-curve"; id?: string; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const graphRef = useRef<SVGSVGElement>(null);
  const metadata = dataset ? getDatasetMetadata(dataset) : null;
  const coordinateMigrationReadiness = dataset ? assessCoordinateDraftMigration(dataset) : null;
  const spaceMigrationReadiness = dataset ? assessLiaisonScapeSpaceMigration(dataset) : null;
  const legacyMigrationReadiness = dataset ? assessLegacyLinkscapeCoordinateMigration(dataset) : null;
  const graph = useMemo(() => dataset ? buildEntityGraph(dataset) : { nodes: [], edges: [], unsupportedEdges: 0 }, [dataset]);
  const transientSuccess = /(?:created|updated|deleted)\./.test(message);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const relationMap = useMemo(() => new Map(dataset?.relations.map((relation) => [relation.id, relation]) ?? []), [dataset]);
  const routedEdges = useMemo(() => {
    const occupiedPaths: Array<Array<{ x: number; y: number }>> = [];
    const overlapCounts = new Map<string, number>();
    return graph.edges.map((edge) => {
      const sourceNode = nodeMap.get(edge.sourceId)!;
      const targetNode = nodeMap.get(edge.targetId)!;
      const source = positions[sourceNode.id] ?? sourceNode;
      const target = positions[targetNode.id] ?? targetNode;
      const obstacles = graph.nodes
        .filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId)
        .map((node) => positions[node.id] ?? node);
      const isOverlappingPair = edge.sourceId !== edge.targetId
        && source.x === target.x
        && source.y === target.y;
      const overlapKey = `${source.x}\u0000${source.y}`;
      const overlapIndex = isOverlappingPair ? (overlapCounts.get(overlapKey) ?? 0) : 0;
      if (isOverlappingPair) overlapCounts.set(overlapKey, overlapIndex + 1);
      const route = routeGraphEdge(
        source,
        target,
        edge.parallelIndex,
        edge.parallelCount,
        obstacles,
        occupiedPaths,
        edge.sourceId === edge.targetId,
        overlapIndex,
        edgeCurveOffsets[edge.id],
        selfLoopOverrides[edge.id],
      );
      occupiedPaths.push(route.samples);
      const relation = relationMap.get(edge.id);
      return {
        ...edge,
        path: route.path,
        samples: route.samples,
        labelPoint: route.labelPoint,
        controlPoint: route.controlPoint,
        label: typeof relation?.name === "string" ? relation.name : "",
      };
    });
  }, [edgeCurveOffsets, graph, nodeMap, positions, relationMap, selfLoopOverrides]);
  const edgeLabelPlacements = useMemo(() => {
    const occupiedLabels: LabelRect[] = [];
    const result = new Map<string, LabelRect>();
    const nodes = graph.nodes.map((node) => positions[node.id] ?? node);
    for (const edge of routedEdges) {
      if (!edge.label) continue;
      const otherEdgePaths = routedEdges.filter(({ id }) => id !== edge.id).map(({ samples }) => samples);
      const placement = placeEdgeLabel(edge.samples, edge.label, occupiedLabels, nodes, otherEdgePaths);
      occupiedLabels.push(placement);
      result.set(edge.id, placement);
    }
    return result;
  }, [graph.nodes, positions, routedEdges]);
  const nodeLabelPlacements = useMemo(() => {
    const occupiedLabels: LabelRect[] = Array.from(edgeLabelPlacements.values());
    const result = new Map<string, LabelRect>();
    const edgePaths = routedEdges.map(({ samples }) => samples).filter(({ length }) => length > 0);
    for (const node of graph.nodes) {
      const position = positions[node.id] ?? node;
      const placement = placeNodeLabel(
        position,
        node.label,
        node.description,
        occupiedLabels,
        graph.nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other),
        edgePaths,
      );
      occupiedLabels.push(placement);
      result.set(node.id, placement);
    }
    return result;
  }, [edgeLabelPlacements, graph.nodes, positions, routedEdges]);
  const selectedDetail = dataset && selectedId ? getEntityDetail(dataset, selectedId) : null;
  const selectedRelationDetail = dataset && selectedRelationId ? getRelationDetail(dataset, selectedRelationId) : null;
  const edgeLayerIndexes = new Map(edgeLayerOrder.map((id, index) => [id, index]));
  const nodeLayerIndexes = new Map(nodeLayerOrder.map((id, index) => [id, index]));
  const displayedEdges = [...routedEdges].sort((left, right) =>
    (edgeLayerIndexes.get(left.id) ?? -1) - (edgeLayerIndexes.get(right.id) ?? -1));
  const displayedNodes = [...graph.nodes].sort((left, right) =>
    (nodeLayerIndexes.get(left.id) ?? -1) - (nodeLayerIndexes.get(right.id) ?? -1));

  useEffect(() => {
    const graphElement = graphRef.current;
    if (!graphElement) return;

    const preventSafariGesture = (event: Event) => event.preventDefault();
    const preventBrowserPinch = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault();
    };
    const zoomWithWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((value) => clampScale(value * (event.deltaY < 0 ? 1.1 : .9)));
    };

    graphElement.addEventListener("gesturestart", preventSafariGesture, { passive: false });
    graphElement.addEventListener("gesturechange", preventSafariGesture, { passive: false });
    graphElement.addEventListener("gestureend", preventSafariGesture, { passive: false });
    graphElement.addEventListener("touchmove", preventBrowserPinch, { passive: false });
    graphElement.addEventListener("wheel", zoomWithWheel, { passive: false });

    return () => {
      graphElement.removeEventListener("gesturestart", preventSafariGesture);
      graphElement.removeEventListener("gesturechange", preventSafariGesture);
      graphElement.removeEventListener("gestureend", preventSafariGesture);
      graphElement.removeEventListener("touchmove", preventBrowserPinch);
      graphElement.removeEventListener("wheel", zoomWithWheel);
    };
  }, [dataset]);

  useEffect(() => {
    if (!detailOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailOpen]);

  useEffect(() => {
    if (!detailOpen && !creationMode && !deleteConfirmation) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
      const dialog = dialogs.at(-1);
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus, true);
    return () => document.removeEventListener("keydown", trapFocus, true);
  }, [creationMode, deleteConfirmation, detailOpen]);

  function open(raw: string) {
    const result = loadDataset(raw);
    setDiagnostics(result.diagnostics);
    if (result.parseError) {
      setDataset(null);
      setMessage(`Import failed: ${result.parseError}`);
      return;
    }
    if (!result.dataset) {
      setDataset(null);
      setMessage("Dataset is invalid according to the Core or supported Extensions.");
      return;
    }
    setDataset(result.dataset);
    setSelectedId(null);
    setSelectedRelationId(null);
    setDetailOpen(false);
    const storedPositions = getStoredCoordinates(result.dataset);
    const openedGraph = buildEntityGraph(result.dataset);
    setNodeLayerOrder(openedGraph.nodes.map(({ id }) => id));
    setEdgeLayerOrder(openedGraph.edges.map(({ id }) => id));
    setNodeLabelOffsets({});
    setEdgeLabelOffsets({});
    setEdgeCurveOffsets({});
    setSelfLoopOverrides({});
    const fittedView = fitGraphView(
      openedGraph.nodes.map((node) => storedPositions[node.id] ?? node),
      800,
      500,
    );
    setPositions(storedPositions);
    setCoordinatesDirty(false);
    setPan(fittedView.pan);
    setScale(fittedView.scale);
    setMessage(`Loaded ${result.dataset.entities.length} Entities and ${result.dataset.relations.length} Relations.`);
  }

  function nodePosition(node: GraphNode) { return positions[node.id] ?? node; }
  function onCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      if (first && second) {
        setScale(pinchZoomScale(
          pinchRef.current.scale,
          pinchRef.current.distance,
          Math.hypot(second.x - first.x, second.y - first.y),
        ));
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / scale;
    const dy = (event.clientY - drag.y) / scale;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, moved };
    if (drag.kind === "canvas" || drag.kind === "edge") setPan((value) => ({ x: value.x + dx * scale, y: value.y + dy * scale }));
    else if (drag.kind === "node" && drag.id && moved) { setCoordinatesDirty(true); setPositions((value) => ({ ...value, [drag.id!]: { ...nodePosition(nodeMap.get(drag.id!)!), x: nodePosition(nodeMap.get(drag.id!)!).x + dx, y: nodePosition(nodeMap.get(drag.id!)!).y + dy } })); }
    else if (drag.kind === "node-label" && drag.id && moved) setNodeLabelOffsets((value) => ({ ...value, [drag.id!]: { x: (value[drag.id!]?.x ?? 0) + dx, y: (value[drag.id!]?.y ?? 0) + dy } }));
    else if (drag.kind === "edge-label" && drag.id && moved) {
      setEdgeLabelOffsets((value) => ({
        ...value,
        [drag.id!]: {
          x: (value[drag.id!]?.x ?? 0) + dx,
          y: (value[drag.id!]?.y ?? 0) + dy,
        },
      }));
    }
    else if (drag.kind === "edge-curve" && drag.id && moved) {
      const edge = graph.edges.find(({ id }) => id === drag.id);
      if (edge && edge.sourceId === edge.targetId) {
        const node = nodePosition(nodeMap.get(edge.sourceId)!);
        const route = routedEdges.find(({ id }) => id === drag.id);
        if (route) {
          const desired = { x: route.controlPoint.x + dx, y: route.controlPoint.y + dy };
          const distance = Math.max(70, Math.hypot(desired.x - node.x, desired.y - node.y));
          const sidewaysDistance = Math.sin(Math.PI / 4) * 32;
          const outwardDistance = Math.cos(Math.PI / 4) * 32;
          const remaining = Math.max(1, distance - outwardDistance);
          const radius = Math.max(38, Math.min(180, (remaining * remaining + sidewaysDistance * sidewaysDistance) / (2 * remaining)));
          setSelfLoopOverrides((value) => ({
            ...value,
            [drag.id!]: { orientation: Math.atan2(desired.y - node.y, desired.x - node.x), radius },
          }));
        }
      }
      else if (edge) {
        const source = nodePosition(nodeMap.get(edge.sourceId)!);
        const target = nodePosition(nodeMap.get(edge.targetId)!);
        const length = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y));
        const normalX = -(target.y - source.y) / length;
        const normalY = (target.x - source.x) / length;
        setEdgeCurveOffsets((value) => ({
          ...value,
          [drag.id!]: (value[drag.id!] ?? 0) + normalX * dx + normalY * dy,
        }));
      }
    }
  }

  function startGraphPointer(
    event: React.PointerEvent<SVGElement>,
    drag: { kind: "canvas" | "node" | "edge" | "node-label" | "edge-label" | "edge-curve"; id?: string },
  ) {
    event.preventDefault();
    const svg = event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
    svg?.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      if (first && second) {
        pinchRef.current = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          scale,
        };
      }
      dragRef.current = null;
      return;
    }

    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
  }

  function endGraphPointer(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const isNodeTap = drag?.kind === "node"
      && !drag.moved
      && pointersRef.current.size === 1
      && pinchRef.current === null;
    const isEdgeTap = drag?.kind === "edge"
      && !drag.moved
      && pointersRef.current.size === 1
      && pinchRef.current === null;
    const isNodeLabelTap = drag?.kind === "node-label" && !drag.moved && pointersRef.current.size === 1 && pinchRef.current === null;
    const isEdgeLabelTap = drag?.kind === "edge-label" && !drag.moved && pointersRef.current.size === 1 && pinchRef.current === null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if ((isNodeTap || isNodeLabelTap) && drag.id) {
      const entity = dataset?.entities.find(({ id }) => id === drag.id);
      setSelectedId(drag.id);
      setSelectedRelationId(null);
      setDetailOpen(isNodeLabelTap);
      setEntityNameDraft(typeof entity?.name === "string" ? entity.name : "");
      setEntityDescriptionDraft(typeof entity?.description === "string" ? entity.description : "");
      setNodeLayerOrder((value) => bringToFront(value, drag.id!));
    }
    if (isEdgeTap && drag.id) {
      const relation = dataset?.relations.find(({ id }) => id === drag.id);
      setSelectedRelationId(drag.id);
      setSelectedId(null);
      setDetailOpen(false);
      setRelationNameDraft(typeof relation?.name === "string" ? relation.name : "");
      setRelationDescriptionDraft(typeof relation?.description === "string" ? relation.description : "");
      setRelationSourceDraft(typeof relation?.sourceId === "string" ? relation.sourceId : "");
      setRelationTargetDraft(typeof relation?.targetId === "string" ? relation.targetId : "");
      setEdgeLayerOrder((value) => bringToFront(value, drag.id!));
    }
    if (isEdgeLabelTap && drag.id) {
      const relation = dataset?.relations.find(({ id }) => id === drag.id);
      setSelectedRelationId(drag.id);
      setSelectedId(null);
      setDetailOpen(true);
      setRelationNameDraft(typeof relation?.name === "string" ? relation.name : "");
      setRelationDescriptionDraft(typeof relation?.description === "string" ? relation.description : "");
      setRelationSourceDraft(typeof relation?.sourceId === "string" ? relation.sourceId : "");
      setRelationTargetDraft(typeof relation?.targetId === "string" ? relation.targetId : "");
      setEdgeLayerOrder((value) => bringToFront(value, drag.id!));
    }
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    dragRef.current = null;
  }

  function saveCoordinates() {
    if (!dataset || !coordinatesDirty) return;
    const saved = applyStoredCoordinates(dataset, positions);
    if (saved === dataset) {
      const readiness = assessCoordinateDraftMigration(dataset);
      if (!readiness.ready && readiness.code === "linkscape_coordinate_draft_migration_target_exists") {
        setMessage("Draft coordinates are already active, but this Dataset does not match LiaisonScape's writable legacy Draft profile.");
        return;
      }
      setMessage("Coordinates remain temporary because the existing Coordinate or Specification payload is not safely writable.");
      return;
    }
    setDataset(saved);
    setCoordinatesDirty(false);
    setMessage("Entity coordinates saved to the experimental Coordinate payload.");
  }

  function migrateCoordinatesToDraft() {
    if (!dataset) return;
    const result = migrateCoordinatePrototypeToDraft(dataset);
    setDiagnostics(result.diagnostics);
    if (!result.migrated) {
      if (result.readiness.ready) return;
      setMessage(`Coordinate migration is unavailable (${result.readiness.code} at ${result.readiness.path}).`);
      return;
    }
    setDataset(result.dataset);
    setPositions(getStoredCoordinates(result.dataset));
    setCoordinatesDirty(false);
    setMessage("Coordinate Prototype migrated to Coordinate Draft 0.1.0.");
  }

  function migrateSpaceToLiaisonScape() {
    if (!dataset) return;
    const result = migrateLinkscapeSpaceToLiaisonScape(dataset);
    setDiagnostics(result.diagnostics);
    if (!result.migrated) {
      setMessage(`Space migration is unavailable (${result.readiness.code} at ${result.readiness.path}).`);
      return;
    }
    setDataset(result.dataset);
    setPositions(getStoredCoordinates(result.dataset));
    setCoordinatesDirty(false);
    setMessage("Linkscape coordinates migrated to LiaisonScape.");
  }

  function migrateLegacyCoordinatesToLiaisonScape() {
    if (!dataset) return;
    const result = migrateLegacyLinkscapeCoordinatesToLiaisonScape(dataset);
    setDiagnostics(result.diagnostics);
    if (!result.migrated) { setMessage(`Legacy migration is unavailable (${result.readiness.code} at ${result.readiness.path}).`); return; }
    setDataset(result.dataset);
    setPositions(getStoredCoordinates(result.dataset));
    setCoordinatesDirty(false);
    setMessage("Legacy Linkscape coordinates migrated to LiaisonScape.");
  }

  function saveRelationDetails() {
    if (!dataset || !selectedRelationId) return;
    const current = getRelationDetail(dataset, selectedRelationId);
    if (!current) { setMessage(`Relation ${selectedRelationId} cannot be updated: relation_not_found`); return; }
    const result = updateRelation(dataset, selectedRelationId, {
      sourceId: relationSourceDraft,
      targetId: relationTargetDraft,
      name: relationNameDraft,
      description: relationDescriptionDraft,
    });
    if ("refusal" in result) { setMessage(`Relation ${selectedRelationId} cannot be updated: ${result.refusal}`); return; }
    setDataset(result.dataset);
    setDetailOpen(false);
    setMessage(`Relation ${selectedRelationId} updated.`);
  }

  function openCreation(mode: "entity" | "relation") {
    const selectedEntity = mode === "relation" ? selectedId ?? "" : "";
    setCreationMode(mode); setCreationName(""); setCreationDescription(""); setCreationSource(selectedEntity); setCreationTarget(selectedEntity); setDetailOpen(false);
  }

  function saveCreation() {
    if (!dataset || !creationMode) return;
    if (creationMode === "entity") {
      const result = createEntity(dataset, { name: creationName, description: creationDescription });
      const created = result.dataset.entities.find(({ id }) => id === result.entityId)!;
      setDataset(result.dataset); setSelectedId(result.entityId); setSelectedRelationId(null); setCreationMode(null);
      setPositions((value) => ({ ...value, [result.entityId]: { x: 400, y: 250 } }));
      setNodeLayerOrder((value) => bringToFront(value, result.entityId));
      setEntityNameDraft(typeof created.name === "string" ? created.name : ""); setEntityDescriptionDraft(typeof created.description === "string" ? created.description : "");
      setMessage(`Entity ${result.entityId} created.`); return;
    }
    const result = createRelation(dataset, { sourceId: creationSource, targetId: creationTarget, name: creationName, description: creationDescription });
    if (!("relationId" in result)) { setMessage(`Relation not created: ${result.refusal}`); return; }
    setDataset(result.dataset); setSelectedRelationId(result.relationId); setSelectedId(null); setCreationMode(null); setMessage(`Relation ${result.relationId} created.`);
  }

  function removeSelectedRelation() {
    if (!dataset || !selectedRelationId) return;
    const assessment = assessRelationDeletion(dataset, selectedRelationId);
    if (!assessment.ready) { setMessage(`Relation cannot be deleted: ${assessment.reason}`); return; }
    setDeleteConfirmationId(selectedRelationId);
    setDetailOpen(false);
    setDeleteConfirmation("relation");
  }

  function removeSelectedEntity() {
    const entityId = selectedId ?? selectedDetail?.entity.id;
    if (!dataset || !entityId) return;
    const assessment = assessEntityDeletion(dataset, entityId);
    if (!assessment.ready) {
      setMessage(assessment.incidentRelationCount ? `Entity cannot be deleted because ${assessment.incidentRelationCount} Relation(s) reference it. Remove those Relations first.` : `Entity cannot be deleted: ${assessment.reason}`);
      return;
    }
    setDeleteConfirmationId(entityId);
    if (!selectedId) setSelectedId(entityId);
    setDetailOpen(false);
    setDeleteConfirmation("entity");
  }

  function confirmDeletion() {
    if (!dataset || !deleteConfirmation || !deleteConfirmationId) return;
    if (deleteConfirmation === "relation") {
      const result = deleteRelation(dataset, deleteConfirmationId);
      if (!result.deleted) { setMessage(`Relation cannot be deleted: ${result.reason}`); setDeleteConfirmation(null); return; }
      setDataset(result.dataset); setSelectedRelationId(null); setDetailOpen(false); setDeleteConfirmation(null); setMessage(`Relation ${result.deletedId} deleted.`); return;
    }
    if (deleteConfirmation === "entity") {
      const result = deleteEntity(dataset, deleteConfirmationId);
      if (!result.deleted) { setMessage(`Entity cannot be deleted: ${result.reason}`); setDeleteConfirmation(null); return; }
      setDataset(result.dataset); setPositions((value) => { const next = { ...value }; delete next[result.deletedId]; return next; }); setSelectedId(null); setDetailOpen(false); setDeleteConfirmation(null); setMessage(`Entity ${result.deletedId} deleted.`);
    }
  }

  function saveEntityDetails() {
    if (!dataset || !selectedId) return;
    setDataset(updateEntityDetails(dataset, selectedId, {
      name: entityNameDraft,
      description: entityDescriptionDraft,
    }));
    setDetailOpen(false);
    setMessage(`Entity ${selectedId} updated.`);
  }

  function openRelatedRelation(relationId: string) {
    if (!dataset) return;
    const relation = dataset.relations.find(({ id }) => id === relationId);
    if (!relation) return;
    setSelectedRelationId(relationId);
    setSelectedId(null);
    setRelationNameDraft(typeof relation.name === "string" ? relation.name : "");
    setRelationDescriptionDraft(typeof relation.description === "string" ? relation.description : "");
    setRelationSourceDraft(typeof relation.sourceId === "string" ? relation.sourceId : "");
    setRelationTargetDraft(typeof relation.targetId === "string" ? relation.targetId : "");
    setDetailOpen(true);
  }

  function resetView() {
    const fittedView = fitGraphView(graph.nodes.map(nodePosition), 800, 500);
    setScale(fittedView.scale);
    setPan(fittedView.pan);
    setSelectedId(null);
    setSelectedRelationId(null);
    setDetailOpen(false);
    setNodeLabelOffsets({});
    setEdgeLabelOffsets({});
    setEdgeCurveOffsets({});
    setSelfLoopOverrides({});
  }

  function exportDataset() {
    if (!dataset) return;
    const exportDiagnostics = validateDatasetForExport(dataset);
    setDiagnostics(exportDiagnostics);
    if (exportDiagnostics.some(({ severity }) => severity === "error")) {
      setMessage("Export blocked: the Dataset has validation errors.");
      return;
    }
    if (exportDiagnostics.length > 0) setMessage("Exporting with validation warnings.");
    const blob = new Blob([serializeDataset(dataset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "e2r-dataset.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <span className="app-brand">LiaisonScape</span>
      </header>
      <main className="app-content">
        <div className="page-header">
          <h1>Entity graph</h1>
          <p>Entity-first E2R relationship graph.</p>
        </div>
        <div className="dataset-actions">
          <label className="open-dataset-button">Open Dataset<input
            type="file"
            accept="application/json,.json,.e2r.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then(open);
            }}
          /></label>
          <div className="dataset-actions__buttons">
            <button type="button" disabled={!dataset} onClick={exportDataset}>Export E2R JSON</button>
            <button type="button" disabled={!dataset} onClick={() => openCreation("entity")}>Add Entity</button>
            <button type="button" disabled={!dataset} onClick={() => openCreation("relation")}>Add Relation</button>
            <button type="button" disabled={!dataset || !coordinatesDirty} onClick={saveCoordinates}>Save node coordinates</button>
            <details className="maintenance-menu">
              <summary>More</summary>
              <div className="maintenance-menu__items">
                <button type="button" disabled={!dataset || coordinateMigrationReadiness?.ready !== true} onClick={migrateCoordinatesToDraft}>Migrate Coordinate to Draft</button>
                <button type="button" disabled={!dataset || spaceMigrationReadiness?.ready !== true} onClick={migrateSpaceToLiaisonScape}>Migrate Linkscape coordinates to LiaisonScape</button>
                <button type="button" disabled={!dataset || legacyMigrationReadiness?.ready !== true} onClick={migrateLegacyCoordinatesToLiaisonScape}>Migrate legacy Linkscape coordinates to LiaisonScape</button>
              </div>
            </details>
          </div>
        </div>
        {!transientSuccess && <p className="status-message" role="status">{message}</p>}
      {dataset && creationMode && (
        <CreationDialog
          mode={creationMode}
          entities={dataset.entities}
          name={creationName}
          description={creationDescription}
          source={creationSource}
          target={creationTarget}
          onNameChange={setCreationName}
          onDescriptionChange={setCreationDescription}
          onSourceChange={setCreationSource}
          onTargetChange={setCreationTarget}
          onSave={saveCreation}
          onCancel={() => setCreationMode(null)}
        />
      )}
{dataset && deleteConfirmation && <ConfirmationDialog subject={deleteConfirmation === "entity" ? "Entity" : "Relation"} onCancel={() => setDeleteConfirmation(null)} onConfirm={confirmDeletion} />}
      {dataset && (
        <dl className="dataset-metadata" aria-label="Dataset metadata">
          <dt>Dataset title</dt><dd>{metadata?.title ?? "Untitled"}</dd>
          <dt>Dataset ID</dt><dd>{metadata?.datasetId ?? "Not assigned"}</dd>
        </dl>
      )}
      {diagnostics.length > 0 && (
        <ul aria-label="Validation diagnostics">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`}>{diagnostic.severity}: {diagnostic.code} ({diagnostic.path})</li>
          ))}
        </ul>
      )}
      {dataset && (
        <section className="graph-section">
          <h2>Graph</h2>
          <div className="viewport-controls" aria-label="Graph view controls">
            <button type="button" onClick={() => setScale((value) => zoomScale(value, "out"))}>Zoom out</button>
            <span aria-live="polite">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((value) => zoomScale(value, "in"))}>Zoom in</button>
            <button type="button" onClick={resetView}>Reset view</button>
          </div>
          {graph.unsupportedEdges > 0 && <p role="status">{graph.unsupportedEdges} Relation(s) with an Event endpoint are not shown in the Entity-first MVP.</p>}
          <svg
            ref={graphRef}
            className="graph"
            viewBox="0 0 800 500"
            role="img"
            aria-label="Entity relationship graph"
            onPointerDown={(event) => { startGraphPointer(event, { kind: "canvas" }); }}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={endGraphPointer}
            onPointerCancel={endGraphPointer}
          >
            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor" /></marker></defs>
            <g transform={centeredViewportTransform(scale, pan, 800, 500)}>
              {displayedEdges.map((edge) => {
                return <g
                  key={edge.id}
                  className={`edge-group${selectedRelationId === edge.id ? " selected" : ""}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setEdgeLayerOrder((value) => bringToFront(value, edge.id));
                    startGraphPointer(event, { kind: "edge", id: edge.id });
                  }}
                >
                  <path d={edge.path} className="edge-halo" />
                  <path d={edge.path} className="edge" markerEnd="url(#arrow)" />
                  <path d={edge.path} className="edge-hit-area" />
                </g>;
              })}
              {displayedEdges.map((edge) => {
                if (!edge.label) return null;
                const labelPoint = edgeLabelPlacements.get(edge.id) ?? edge.labelPoint;
                return <g
                  key={`label-${edge.id}`}
                  className="edge-label-group"
                  transform={`translate(${edgeLabelOffsets[edge.id]?.x ?? 0} ${edgeLabelOffsets[edge.id]?.y ?? 0})`}
                  onPointerDown={(event) => { event.stopPropagation(); startGraphPointer(event, { kind: "edge-label", id: edge.id }); }}
                >
                  <rect className="label-drag-hit" x={labelPoint.x - Math.max(24, edge.label.length * 3.5)} y={labelPoint.y - 18} width={Math.max(48, edge.label.length * 7)} height="22" rx="3" />
                  <text className="edge-label" x={labelPoint.x} y={labelPoint.y - 5} aria-hidden="true">{edge.label}</text>
                </g>;
              })}
              {displayedEdges.map((edge) => selectedRelationId === edge.id && (
                <g key={`control-${edge.id}`} className="edge-curve-control">
                  <line x1={edge.labelPoint.x} y1={edge.labelPoint.y} x2={edge.controlPoint.x} y2={edge.controlPoint.y} />
                  <circle
                    cx={edge.controlPoint.x}
                    cy={edge.controlPoint.y}
                    r="7"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startGraphPointer(event, { kind: "edge-curve", id: edge.id });
                    }}
                  />
                </g>
              ))}
              {displayedNodes.map((node) => { const position = nodePosition(node); return (
                <g key={node.id} className={`node ${selectedId === node.id ? "selected" : ""}`} transform={`translate(${position.x} ${position.y})`} onPointerDown={(event) => { event.stopPropagation(); setNodeLayerOrder((value) => bringToFront(value, node.id)); startGraphPointer(event, { kind: "node", id: node.id }); }}>
                  <circle r="32" />
                  <title>{node.description ? `${node.label}\n${node.description}` : node.label}</title>
                  {(() => {
                    const placement = nodeLabelPlacements.get(node.id)!;
                    const manualOffset = nodeLabelOffsets[node.id] ?? { x: 0, y: 0 };
                    const offsetX = placement.x - position.x + manualOffset.x;
                    const offsetY = placement.y - position.y + manualOffset.y;
                    const labelDistance = Math.max(1, Math.hypot(offsetX, offsetY));
                    const directionX = offsetX / labelDistance;
                    const directionY = offsetY / labelDistance;
                    const boundaryDistance = Math.min(
                      Math.abs(directionX) > .001 ? placement.width / 2 / Math.abs(directionX) : Infinity,
                      Math.abs(directionY) > .001 ? placement.height / 2 / Math.abs(directionY) : Infinity,
                    );
                    return <g
                      className="node-label-group"
                      onPointerDown={(event) => { event.stopPropagation(); startGraphPointer(event, { kind: "node-label", id: node.id }); }}
                    >
                      {shouldShowNodeLabelConnector({ x: offsetX, y: offsetY }) && (
                        <line
                          className="node-label-connector"
                          x1={directionX * 33}
                          y1={directionY * 33}
                          x2={offsetX - directionX * boundaryDistance}
                          y2={offsetY - directionY * boundaryDistance}
                        />
                      )}
                      <rect className="label-drag-hit" x={offsetX - placement.width / 2} y={offsetY - placement.height / 2} width={placement.width} height={placement.height} rx="3" />
                      <text className="node-label" textAnchor="middle" x={offsetX} y={offsetY + (node.description ? -3 : 4)}>{truncateNodeText(node.label, 22)}</text>
                      {node.description && <text className="node-description" textAnchor="middle" x={offsetX} y={offsetY + 12}>{truncateNodeText(node.description, 28)}</text>}
                    </g>;
                  })()}
                </g>
              ); })}
            </g>
          </svg>
          <p role="status">{selectedId
            ? `Selected Entity: ${selectedId}`
            : selectedRelationId
              ? `Selected Relation: ${selectedRelationId}`
              : "Select an Entity or Relation"}</p>
          {selectedRelationDetail && !detailOpen && (
            <div className="graph-selection-actions">
              <button type="button" onClick={() => setDetailOpen(true)}>Edit Relation</button>
              <button
                type="button"
                disabled={edgeCurveOffsets[selectedRelationDetail.relation.id] === undefined
                  && selfLoopOverrides[selectedRelationDetail.relation.id] === undefined}
                onClick={() => {
                  setEdgeCurveOffsets((value) => {
                    const updated = { ...value };
                    delete updated[selectedRelationDetail.relation.id];
                    return updated;
                  });
                  setSelfLoopOverrides((value) => {
                    const updated = { ...value };
                    delete updated[selectedRelationDetail.relation.id];
                    return updated;
                  });
                }}
              >
                Use automatic route
              </button>
              <button
                type="button"
                disabled={edgeLabelOffsets[selectedRelationDetail.relation.id] === undefined}
                onClick={() => setEdgeLabelOffsets((value) => {
                  const updated = { ...value };
                  delete updated[selectedRelationDetail.relation.id];
                  return updated;
                })}
              >
                Use automatic label position
              </button>
            </div>
          )}
          {selectedDetail && !detailOpen && (
            <div className="graph-selection-actions">
              <button type="button" onClick={() => setDetailOpen(true)}>Edit Entity</button>
            </div>
          )}
          <p className="graph-summary">{graph.nodes.length} entities · {graph.edges.length} relations</p>
          {dataset && coordinateMigrationReadiness && !coordinateMigrationReadiness.ready && coordinateMigrationReadiness.code !== "linkscape_coordinate_draft_migration_no_source" && (
            <p className="status-message" role="status">
              {coordinateMigrationReadiness.code === "linkscape_coordinate_draft_migration_target_exists"
                ? "Coordinate Draft is already present; migration has already been completed."
                : `Coordinate migration unavailable: ${coordinateMigrationReadiness.code} (${coordinateMigrationReadiness.path})`}
            </p>
          )}
          <p className="selection-message" role="status">{transientSuccess ? message : (coordinatesDirty ? "Moved coordinates are temporary until you save them." : "Stored coordinates are restored when available.")}</p>
          {detailOpen && selectedDetail && (
            <EntityDetailDialog
              dataset={dataset}
              detail={selectedDetail}
              name={entityNameDraft}
              description={entityDescriptionDraft}
              onNameChange={setEntityNameDraft}
              onDescriptionChange={setEntityDescriptionDraft}
              onSave={saveEntityDetails}
              onDelete={removeSelectedEntity}
              onRelated={openRelatedRelation}
              onClose={() => setDetailOpen(false)}
            />
          )}
          {detailOpen && selectedRelationDetail && (
            <RelationDetailDialog
              relation={selectedRelationDetail.relation}
              sourceId={selectedRelationDetail.sourceId}
              targetId={selectedRelationDetail.targetId}
              source={selectedRelationDetail.source}
              target={selectedRelationDetail.target}
              name={relationNameDraft}
              description={relationDescriptionDraft}
              endpointEditing={dataset.entities.some(({ id }) => id === selectedRelationDetail.sourceId)
                && dataset.entities.some(({ id }) => id === selectedRelationDetail.targetId)
                ? {
                  entities: dataset.entities,
                  sourceId: relationSourceDraft,
                  targetId: relationTargetDraft,
                  onSourceChange: setRelationSourceDraft,
                  onTargetChange: setRelationTargetDraft,
                }
                : undefined}
              onNameChange={setRelationNameDraft}
              onDescriptionChange={setRelationDescriptionDraft}
              onSave={saveRelationDetails}
              onDelete={removeSelectedRelation}
              onClose={() => setDetailOpen(false)}
            />
          )}
        </section>
      )}
      </main>
    </div>
  );
}
