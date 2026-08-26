import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { assessCoordinateDraftMigration, migrateCoordinatePrototypeToDraft } from "./coordinate-migration";
import { assessLiaisonScapeSpaceMigration, migrateLinkscapeSpaceToLiaisonScape } from "./space-migration";
import { applyStoredCoordinates, buildEntityGraph, getStoredCoordinates, updateDatasetTitle, type Dataset, type Diagnostic, type GraphNode } from "./dataset";
import { getDatasetMetadata, loadDataset, serializeDataset, validateDatasetForExport } from "./services/DatasetService";
import { assessEntityDeletion, createEntity, deleteEntity } from "./services/EntityService";
import { getEntityDetail, updateEntityDetails } from "./services/EntityService";
import { assessRelationDeletion, createRelation, deleteRelation } from "./services/RelationService";
import { getRelationDetail, updateRelation } from "./services/RelationService";
import { canCompleteLongPress, createCanvasContextMenu, draggedPointFromOrigin, graphPointFromPointer, graphPointFromViewportCenter, isLongPress, svgPointFromPointer, type ContextMenu } from "./direct-graph-authoring";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { DatasetReplacementDialog } from "./components/DatasetReplacementDialog";
import { CreditsDialog } from "./components/CreditsDialog";
import { EntityDetailDialog } from "./components/EntityDetailDialog";
import { RelationDetailDialog } from "./components/RelationDetailDialog";
import { CreationDialog } from "./components/CreationDialog";
import { boundedDragContinuationOffset, bringToFront, centeredViewportTransform, clampScale, compareRouteGeometry, curveOffsetFromControlPoint, fitGraphView, getArrowheadGeometry, nearestPolylineArcFraction, placeEdgeLabel, placeNodeLabel, pinchZoomScale, pointAtPolylineArcFraction, routeGraphEdge, routeSamplesHaveNodeInfluence, shouldShowNodeLabelConnector, solveVisibleRouteOffset, truncateNodeText, type LabelRect, wrapNodeLabel, zoomScale } from "./viewport";
import { applyLocale, formatDiagnosticSeverity, formatEntityDeletionRefusal, formatEntityIncidentWarning, formatGraphSummary, formatRelationCreationRefusal, formatRelationDeletionRefusal, formatRelationUpdateRefusal, formatSelectedEntity, formatSelectedRelation, formatUnsupportedEventRelations, getInitialLocale, saveLocale, translate, type Locale } from "./i18n";
import { deriveManualNodeLabelOffset, deriveManualRelationLabelAnchor, reconstructManualRelationLabelTarget, reconcileRelationLabelVisualState, type ManualRelationLabelAnchor, type RelationLabelVisualState } from "./relation-label-presentation";
import { composeHoverLines, placementOwnership, type PlacementTarget } from "./placement-ownership";
import { applyEntityCreationPlacement, cancelStagedDatasetReplacement, candidateFromLoadResult, decideDatasetReplacement, discardAndContinueStagedDatasetReplacement, hasDocumentExitLossRisk, hasPendingUserWork, isDatasetModified, preservePendingCoordinates, resetManualRelationRoute } from "./dataset-replacement-safety";
import { canRestoreReplacementTrigger } from "./replacement-focus";
import { parseDatasetHandoffFragment, updateDatasetHandoffFragment } from "./dataset-handoff";

const emptyDataset: Dataset = { version: "1.0", entities: [], events: [], relations: [] };
type StartupHandoffFailure = "invalid-fragment" | "fetch-failed" | "parse-failed" | "validation-failed";
type OpenDatasetResult = { status: "accepted-or-staged" } | { status: "parse-error" } | { status: "validation-error" };
type DatasetReplacementSource = "handoff" | "local" | "sample" | "new";

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale(
    window.localStorage,
    window.navigator.language,
  ));
  const [view, setView] = useState<"home" | "workspace">("home");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetTitleEditing, setDatasetTitleEditing] = useState(false);
  const [datasetTitleDraft, setDatasetTitleDraft] = useState("");
  const [datasetModified, setDatasetModified] = useState(false);
  const [pendingDatasetReplacement, setPendingDatasetReplacement] = useState<Dataset | null>(null);
  const [pendingDatasetReplacementSource, setPendingDatasetReplacementSource] = useState<DatasetReplacementSource | null>(null);
  const [startupHandoffFailure, setStartupHandoffFailure] = useState<StartupHandoffFailure | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [message, setMessage] = useState("Import an E2R Dataset to begin.");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
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
  const [edgeLabelOffsets, setEdgeLabelOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [edgeCurveOffsets, setEdgeCurveOffsets] = useState<Record<string, number>>({});
  const [selfLoopOverrides, setSelfLoopOverrides] = useState<Record<string, { orientation: number; radius: number }>>({});
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportToolbarPosition, setViewportToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [coordinatesDirty, setCoordinatesDirty] = useState(false);
  const [creationMode, setCreationMode] = useState<"entity" | "relation" | null>(null);
  const [relationCreationPreview, setRelationCreationPreview] = useState<{ sourceId: string; point: { x: number; y: number }; targetId: string | null } | null>(null);
  const [creationName, setCreationName] = useState("");
  const [creationDescription, setCreationDescription] = useState("");
  const [creationSource, setCreationSource] = useState("");
  const [creationTarget, setCreationTarget] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [pendingEntityPlacement, setPendingEntityPlacement] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<"entity" | "relation" | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [maintenanceMenuOpen, setMaintenanceMenuOpen] = useState(false);
  const creditsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [manualLabelRevision, setManualLabelRevision] = useState(0);
  const [hoveredPlacement, setHoveredPlacement] = useState<{ target: PlacementTarget | "entity"; id: string; clientX: number; clientY: number; entityBounds?: { left: number; bottom: number } } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cleanDatasetBaseline = useRef<Dataset | null>(null);
  const previousNodeLabelPlacements = useRef(new Map<string, LabelRect>());
  const previousEdgeLabelPlacements = useRef(new Map<string, LabelRect>());
  const relationLabelVisualState = useRef(new Map<string, RelationLabelVisualState>());
  const manualRelationLabelAnchors = useRef(new Map<string, ManualRelationLabelAnchor>());
  const manualNodeLabelOffsets = useRef(new Map<string, { x: number; y: number }>());
  const dragRef = useRef<{ kind: "canvas" | "node" | "edge" | "node-label" | "edge-label" | "edge-curve" | "relation-create"; id?: string; button: number; x: number; y: number; startX: number; startY: number; moved: boolean; startGraphPoint?: { x: number; y: number }; startNodePosition?: { x: number; y: number }; startLabelPosition?: { x: number; y: number }; startCurveOffset?: number; startCurveNormal?: { x: number; y: number }; startControlPoint?: { x: number; y: number }; startGrabFraction?: number; startRouteSamples?: Array<{ x: number; y: number }>; lastDesiredNormalDelta?: number; lastValidOffset?: number; lastValidGain?: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const graphRef = useRef<SVGSVGElement>(null);
  const viewportToolbarRef = useRef<HTMLDivElement>(null);
  const viewportToolbarDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const edgeCurveDragStartRef = useRef<{ id: string; offset?: number; selfLoop?: { orientation: number; radius: number } } | null>(null);
  const longPressRef = useRef<{ pointerId: number; startX: number; startY: number; timer: number; kind: "canvas" | "entity" | "node-label" | "relation-path" | "relation-label"; id?: string; canceled: boolean } | null>(null);
  const longPressClaimedRef = useRef<number | null>(null);
  const suppressNextContextMenuRef = useRef(false);
  const homeOpenFileInputRef = useRef<HTMLInputElement>(null);
  const workspaceOpenFileInputRef = useRef<HTMLInputElement>(null);
  const replacementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const datasetTitleInputRef = useRef<HTMLInputElement | null>(null);
  const datasetTitleEditTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreDatasetTitleFocusRef = useRef(false);
  const maintenanceMenuRef = useRef<HTMLDetailsElement>(null);
  const maintenanceMenuSummaryRef = useRef<HTMLElement>(null);
  const restoreReplacementFocusRef = useRef(false);
  const startupHandoffStartedRef = useRef(false);

  useEffect(() => {
    if (!maintenanceMenuOpen) return;
    const firstItem = maintenanceMenuRef.current?.querySelector<HTMLButtonElement>(".maintenance-menu__items > button:not(:disabled)");
    firstItem?.focus();
  }, [maintenanceMenuOpen]);

  useEffect(() => {
    function closeMaintenanceMenu() {
      const menu = maintenanceMenuRef.current;
      if (menu?.open) menu.open = false;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const menu = maintenanceMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) closeMaintenanceMenu();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      const menu = maintenanceMenuRef.current;
      if (event.key === "Escape" && menu?.open) {
        event.preventDefault();
        closeMaintenanceMenu();
        maintenanceMenuSummaryRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  useEffect(() => {
    saveLocale(window.localStorage, locale);
    applyLocale(locale, document);
  }, [locale]);

  useEffect(() => {
    if (startupHandoffStartedRef.current) return;
    startupHandoffStartedRef.current = true;
    const handoff = parseDatasetHandoffFragment(window.location.hash);
    if (handoff.kind === "none") return;
    if (handoff.kind === "invalid") {
      setStartupHandoffFailure("invalid-fragment");
      return;
    }
    setStartupHandoffFailure(null);
    void fetch(handoff.datasetUrl, { credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error("handoff-fetch-failed");
        return response.text();
      })
      .then((raw) => {
        const result = open(raw, null, "handoff");
        if (result.status === "parse-error") setStartupHandoffFailure("parse-failed");
        else if (result.status === "validation-error") setStartupHandoffFailure("validation-failed");
      })
      .catch(() => setStartupHandoffFailure("fetch-failed"));
  }, []);

  useEffect(() => {
    window.history.replaceState({ liaisonScapeView: "home" }, "");
    const onPopState = (event: PopStateEvent) => {
      const nextView = event.state?.liaisonScapeView;
      if (nextView !== "home" && nextView !== "workspace") return;
      setView(nextView);
      if (nextView === "home") setMessage(translate(locale, "browserBackDatasetNotice"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (pendingDatasetReplacement || !restoreReplacementFocusRef.current) return;
    restoreReplacementFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const trigger = replacementTriggerRef.current;
      if (trigger && canRestoreReplacementTrigger(trigger)) trigger.focus();
      else document.querySelector<HTMLElement>(".home-page h1, .app-brand-button")?.focus();
      replacementTriggerRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingDatasetReplacement]);
  useEffect(() => {
    if (!datasetTitleEditing) {
      if (!restoreDatasetTitleFocusRef.current) return;
      restoreDatasetTitleFocusRef.current = false;
      const frame = window.requestAnimationFrame(() => datasetTitleEditTriggerRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => datasetTitleInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [datasetTitleEditing]);
  const metadata = dataset ? getDatasetMetadata(dataset) : null;
  const coordinateMigrationReadiness = dataset ? assessCoordinateDraftMigration(dataset) : null;
  const spaceMigrationReadiness = dataset ? assessLiaisonScapeSpaceMigration(dataset) : null;
  const graph = useMemo(() => dataset ? buildEntityGraph(dataset) : { nodes: [], edges: [], unsupportedEdges: 0, eventRelatedHiddenEdges: 0, otherUnsupportedEdges: 0 }, [dataset]);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const relationMap = useMemo(() => new Map(dataset?.relations.map((relation) => [relation.id, relation]) ?? []), [dataset]);
  const routedEdges = useMemo(() => {
    const occupiedPaths: Array<Array<{ x: number; y: number }>> = [];
    const overlapCounts = new Map<string, number>();
    const routedById = new Map<string, ReturnType<typeof routeGraphEdge> & { label: string; parallelSolverEligible: boolean }>();
    const compareRoutingPriority = (left: typeof graph.edges[number], right: typeof graph.edges[number]) =>
      left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId)
      || left.id.localeCompare(right.id);
    const fixedEdges = graph.edges.filter((edge) => {
      const sourceNode = nodeMap.get(edge.sourceId)!;
      const targetNode = nodeMap.get(edge.targetId)!;
      const source = positions[sourceNode.id] ?? sourceNode;
      const target = positions[targetNode.id] ?? targetNode;
      return edgeCurveOffsets[edge.id] !== undefined
        || edge.sourceId === edge.targetId
        || (source.x === target.x && source.y === target.y);
    }).sort(compareRoutingPriority);
    const automaticOrdinaryEdges = graph.edges.filter((edge) => !fixedEdges.some(({ id }) => id === edge.id))
      .sort(compareRoutingPriority);
    for (const edge of [...fixedEdges, ...automaticOrdinaryEdges]) {
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
      const routeWithoutObstacles = edge.parallelCount > 1
        && edge.sourceId !== edge.targetId
        && !isOverlappingPair
        ? routeGraphEdge(
          source,
          target,
          edge.parallelIndex,
          edge.parallelCount,
          [],
          occupiedPaths,
          false,
          overlapIndex,
          edgeCurveOffsets[edge.id],
          selfLoopOverrides[edge.id],
        )
        : null;
      const routeWithoutObstaclesOrOccupiedPaths = routeWithoutObstacles !== null
        ? routeGraphEdge(
          source,
          target,
          edge.parallelIndex,
          edge.parallelCount,
          [],
          [],
          false,
          overlapIndex,
          edgeCurveOffsets[edge.id],
          selfLoopOverrides[edge.id],
        )
        : null;
      const obstacleComparison = routeWithoutObstacles === null
        ? null
        : compareRouteGeometry(routeWithoutObstacles.samples, route.samples);
      const occupiedPathComparison = routeWithoutObstacles === null || routeWithoutObstaclesOrOccupiedPaths === null
        ? null
        : compareRouteGeometry(routeWithoutObstaclesOrOccupiedPaths.samples, routeWithoutObstacles.samples);
      const parallelSolverEligible = edge.parallelCount > 1
        && edge.sourceId !== edge.targetId
        && !isOverlappingPair
        && obstacleComparison?.equivalent === true
        && occupiedPathComparison?.equivalent === true;
      occupiedPaths.push(route.samples);
      const relation = relationMap.get(edge.id);
      routedById.set(edge.id, {
        path: route.path,
        samples: route.samples,
        labelPoint: route.labelPoint,
        controlPoint: route.controlPoint,
        label: typeof relation?.name === "string" ? relation.name : "",
        parallelSolverEligible,
      });
    }
    return graph.edges.map((edge) => ({ ...edge, ...routedById.get(edge.id)! }));
  }, [edgeCurveOffsets, graph, nodeMap, positions, relationMap, selfLoopOverrides]);
  const edgeLabelPlacements = useMemo(() => {
    const occupiedLabels: LabelRect[] = [];
    const result = new Map<string, LabelRect>();
    const nodes = graph.nodes.map((node) => positions[node.id] ?? node);
    const draggedNodeId = dragRef.current?.kind === "node" ? dragRef.current.id : undefined;
    for (const edge of routedEdges) {
      if (!edge.label) continue;
      const otherEdgePaths = routedEdges.filter(({ id }) => id !== edge.id).map(({ samples }) => samples);
      const relationMovesWithDraggedNode = draggedNodeId !== undefined &&
        (edge.sourceId === draggedNodeId || edge.targetId === draggedNodeId);
      const automaticPlacement = placeEdgeLabel(
        edge.samples,
        edge.label,
        occupiedLabels,
        nodes,
        otherEdgePaths,
        relationMovesWithDraggedNode ? undefined : previousEdgeLabelPlacements.current.get(edge.id),
      );
      const manualAnchor = manualRelationLabelAnchors.current.get(edge.id);
      const placement = manualAnchor
        ? { ...automaticPlacement, ...reconstructManualRelationLabelTarget(edge.samples, manualAnchor) }
        : automaticPlacement;
      occupiedLabels.push(placement);
      result.set(edge.id, placement);
    }
    return result;
  }, [graph.nodes, positions, routedEdges, manualLabelRevision]);
  const displayedEdgeLabelPlacements = useMemo(() => {
    const result = new Map<string, LabelRect>();
    const liveIds = new Set(edgeLabelPlacements.keys());
    for (const id of relationLabelVisualState.current.keys()) if (!liveIds.has(id)) relationLabelVisualState.current.delete(id);
    for (const [id, target] of edgeLabelPlacements) {
      const edge = routedEdges.find(({ id: edgeId }) => edgeId === id);
      const state = reconcileRelationLabelVisualState(
        relationLabelVisualState.current.get(id),
        target,
        true,
      );
      relationLabelVisualState.current.set(id, state);
      result.set(id, state.current);
    }
    return result;
  }, [edgeLabelPlacements, routedEdges, positions]);
  const nodeLabelPlacements = useMemo(() => {
    const occupiedLabels: LabelRect[] = Array.from(edgeLabelPlacements.values());
    const result = new Map<string, LabelRect>();
    const edgePaths = routedEdges.map(({ samples }) => samples).filter(({ length }) => length > 0);
    for (const node of graph.nodes) {
      const position = positions[node.id] ?? node;
      const isActivelyDraggedNode = dragRef.current?.kind === "node" && dragRef.current.id === node.id;
      const automaticPlacement = placeNodeLabel(
        position,
        node.label,
        node.description,
        occupiedLabels,
        graph.nodes.filter(({ id }) => id !== node.id).map((other) => positions[other.id] ?? other),
        edgePaths,
        isActivelyDraggedNode ? undefined : previousNodeLabelPlacements.current.get(node.id),
      );
      const manualOffset = manualNodeLabelOffsets.current.get(node.id);
      const placement = manualOffset
        ? { ...automaticPlacement, x: position.x + manualOffset.x, y: position.y + manualOffset.y }
        : automaticPlacement;
      occupiedLabels.push(placement);
      result.set(node.id, placement);
    }
    return result;
  }, [edgeLabelPlacements, graph.nodes, positions, routedEdges, manualLabelRevision]);

  useEffect(() => {
    previousNodeLabelPlacements.current = new Map(nodeLabelPlacements);
    previousEdgeLabelPlacements.current = new Map(edgeLabelPlacements);
  }, [edgeLabelPlacements, nodeLabelPlacements]);

  function resetPreviousLabelPlacements() {
    previousNodeLabelPlacements.current.clear();
    previousEdgeLabelPlacements.current.clear();
    relationLabelVisualState.current.clear();
    manualRelationLabelAnchors.current.clear();
    manualNodeLabelOffsets.current.clear();
    setManualLabelRevision((value) => value + 1);
  }
  const selectedDetail = dataset && selectedId ? getEntityDetail(dataset, selectedId) : null;
  const selectedRelationDetail = dataset && selectedRelationId ? getRelationDetail(dataset, selectedRelationId) : null;
  const pendingUserWork = hasPendingUserWork({
    unsavedCoordinates: coordinatesDirty,
    manualRelationRoute: Object.keys(edgeCurveOffsets).length > 0 || Object.keys(selfLoopOverrides).length > 0,
    manualRelationLabel: manualRelationLabelAnchors.current.size > 0,
    manualNodeLabel: manualNodeLabelOffsets.current.size > 0,
    meaningfulCreationDraft: creationMode !== null && [creationName, creationDescription, creationSource, creationTarget].some((value) => value.trim().length > 0),
    meaningfulEntityDetailDraft: detailOpen && selectedDetail !== null && (
      entityNameDraft !== (typeof selectedDetail.entity.name === "string" ? selectedDetail.entity.name : "")
      || entityDescriptionDraft !== (typeof selectedDetail.entity.description === "string" ? selectedDetail.entity.description : "")
    ),
    meaningfulRelationDetailDraft: detailOpen && selectedRelationDetail !== null && (
      relationNameDraft !== (typeof selectedRelationDetail.relation.name === "string" ? selectedRelationDetail.relation.name : "")
      || relationDescriptionDraft !== (typeof selectedRelationDetail.relation.description === "string" ? selectedRelationDetail.relation.description : "")
      || relationSourceDraft !== selectedRelationDetail.sourceId
      || relationTargetDraft !== selectedRelationDetail.targetId
    ),
    meaningfulDatasetTitleDraft: datasetTitleEditing && datasetTitleDraft !== (metadata?.title ?? ""),
  });
  const replacementLossRisk = hasDocumentExitLossRisk(datasetModified, pendingUserWork);
  useEffect(() => {
    if (!replacementLossRisk) return;
    const preventDocumentExitLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventDocumentExitLoss);
    return () => window.removeEventListener("beforeunload", preventDocumentExitLoss);
  }, [replacementLossRisk]);
  const edgeLayerIndexes = new Map(edgeLayerOrder.map((id, index) => [id, index]));
  const nodeLayerIndexes = new Map(nodeLayerOrder.map((id, index) => [id, index]));
  const displayedEdges = [...routedEdges].sort((left, right) =>
    (edgeLayerIndexes.get(left.id) ?? -1) - (edgeLayerIndexes.get(right.id) ?? -1));
  const displayedNodes = [...graph.nodes].sort((left, right) =>
    (nodeLayerIndexes.get(left.id) ?? -1) - (nodeLayerIndexes.get(right.id) ?? -1));
  function placementText(target: PlacementTarget, id: string): string {
    const manual = target === "relation-route"
      ? edgeCurveOffsets[id] !== undefined || selfLoopOverrides[id] !== undefined
      : target === "relation-label"
        ? manualRelationLabelAnchors.current.has(id)
        : manualNodeLabelOffsets.current.has(id);
    return translate(locale, placementOwnership(manual) === "user" ? "userPlacement" : "automaticPlacement");
  }
  function setPlacementHover(event: React.PointerEvent<SVGElement>, target: PlacementTarget | "entity", id: string) {
    const bounds = target === "entity" || target === "node-label" || target === "relation-label"
      ? event.currentTarget.getBoundingClientRect()
      : null;
    setPopoverPosition(null);
    setHoveredPlacement({ target, id, clientX: event.clientX, clientY: event.clientY, entityBounds: bounds ? { left: bounds.left, bottom: bounds.bottom } : undefined });
  }

  function preferredPopoverPosition(placement: NonNullable<typeof hoveredPlacement>) {
    const bounds = placement.entityBounds;
    return placement.target === "entity" && bounds
      ? { left: bounds.left, top: bounds.bottom + 8 }
      : placement.target === "node-label" || placement.target === "relation-label"
        ? { left: bounds?.left ?? placement.clientX + 12, top: (bounds?.bottom ?? placement.clientY) + 8 }
        : { left: placement.clientX + 12, top: placement.clientY + 12 };
  }

  useLayoutEffect(() => {
    if (!hoveredPlacement || (hoveredPlacement.target === "entity" && !hoveredPlacement.entityBounds)) {
      setPopoverPosition(null);
      return;
    }
    const preferred = preferredPopoverPosition(hoveredPlacement);
    const popover = popoverRef.current;
    const viewport = graphRef.current?.getBoundingClientRect();
    if (!popover || !viewport) return;
    const measured = popover.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(viewport.left + margin, Math.min(preferred.left, viewport.right - measured.width - margin));
    const top = Math.max(viewport.top + margin, Math.min(preferred.top, viewport.bottom - measured.height - margin));
    if (left !== preferred.left || top !== preferred.top) setPopoverPosition({ left, top });
  }, [hoveredPlacement]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuPosition(null);
      return;
    }
    const menu = contextMenuRef.current;
    if (!menu) return;
    const measured = menu.getBoundingClientRect();
    const margin = 8;
    const usableWidth = document.documentElement.clientWidth;
    const usableHeight = document.documentElement.clientHeight;
    const left = Math.max(margin, Math.min(contextMenu.clientX, usableWidth - measured.width - margin));
    const top = Math.max(margin, Math.min(contextMenu.clientY, usableHeight - measured.height - margin));
    setContextMenuPosition({ left, top });
  }, [contextMenu]);

  useEffect(() => {
    const graphElement = graphRef.current;
    if (!graphElement) return;

    const preventSafariGesture = (event: Event) => event.preventDefault();
    const preventBrowserPinch = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault();
    };
    const zoomWithWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const rect = graphElement.getBoundingClientRect();
      const pointer = { clientX: event.clientX, clientY: event.clientY };
      const graphPoint = graphPointFromPointer(
        pointer,
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        { width: 800, height: 500 },
        scale,
        pan,
      );
      if (!graphPoint) return;
      const nextScale = clampScale(scale * (event.deltaY < 0 ? 1.1 : .9));
      const view = svgPointFromPointer(pointer, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, { x: 0, y: 0, width: 800, height: 500 });
      if (!view) return;
      event.preventDefault();
      setScale(nextScale);
      setPan({
        x: view.x - 400 - nextScale * (graphPoint.x - 400),
        y: view.y - 250 - nextScale * (graphPoint.y - 250),
      });
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
  }, [dataset, pan, scale]);

  useEffect(() => {
    if (!detailOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailOpen]);

  useEffect(() => {
    if (!relationCreationPreview) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRelationCreationPreview(null);
      dragRef.current = null;
      pinchRef.current = null;
      pointersRef.current.clear();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [relationCreationPreview]);

  useEffect(() => {
    const cancelCurveDrag = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dragRef.current?.kind !== "edge-curve") return;
      restoreEdgeCurveDrag();
      edgeCurveDragStartRef.current = null;
      dragRef.current = null;
      pointersRef.current.clear();
      pinchRef.current = null;
    };
    window.addEventListener("keydown", cancelCurveDrag);
    return () => window.removeEventListener("keydown", cancelCurveDrag);
  });

  useEffect(() => {
    if (!detailOpen && !creationMode && !deleteConfirmation && !creditsOpen) return;
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
  }, [creationMode, deleteConfirmation, detailOpen, creditsOpen]);

  useEffect(() => {
    if (!creditsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCreditsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [creditsOpen]);

  useEffect(() => {
    if (creditsOpen || !creditsTriggerRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const trigger = creditsTriggerRef.current;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      creditsTriggerRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [creditsOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".context-menu")) return;
      setContextMenu(null);
    };
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("pointerdown", dismissOnOutsidePointer);
    return () => {
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("pointerdown", dismissOnOutsidePointer);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!viewportToolbarPosition) return;
    const graphElement = graphRef.current;
    const toolbar = viewportToolbarRef.current;
    if (!graphElement || !toolbar) return;
    const clampToolbar = () => {
      const graphRect = graphElement.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      setViewportToolbarPosition((value) => value ? {
        x: Math.max(0, Math.min(value.x, graphRect.width - toolbarRect.width)),
        y: Math.max(0, Math.min(value.y, graphRect.height - toolbarRect.height)),
      } : value);
    };
    const observer = new ResizeObserver(clampToolbar);
    observer.observe(graphElement);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [viewportToolbarPosition]);

  function acceptDataset(nextDataset: Dataset, source: DatasetReplacementSource | null = pendingDatasetReplacementSource) {
    if (source !== "handoff") {
      const nextHash = updateDatasetHandoffFragment(window.location.hash, null);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
    replacementTriggerRef.current = null;
    restoreReplacementFocusRef.current = false;
    setContextMenu(null);
    setHoveredPlacement(null);
    resetPreviousLabelPlacements();
    cleanDatasetBaseline.current = structuredClone(nextDataset);
    setDataset(nextDataset);
    setDatasetModified(false);
    setDatasetTitleEditing(false);
    setDatasetTitleDraft("");
    restoreDatasetTitleFocusRef.current = false;
    setPendingDatasetReplacement(null);
    setPendingDatasetReplacementSource(null);
    setSelectedId(null);
    setSelectedRelationId(null);
    setDetailOpen(false);
    const storedPositions = getStoredCoordinates(nextDataset);
    const openedGraph = buildEntityGraph(nextDataset);
    setNodeLayerOrder(openedGraph.nodes.map(({ id }) => id));
    setEdgeLayerOrder(openedGraph.edges.map(({ id }) => id));
    setEdgeLabelOffsets({});
    setEdgeCurveOffsets({});
    setSelfLoopOverrides({});
    const fittedView = fitGraphView(openedGraph.nodes.map((node) => storedPositions[node.id] ?? node), 800, 500);
    setPositions(storedPositions);
    setCoordinatesDirty(false);
    setPan(fittedView.pan);
    setScale(fittedView.scale);
    enterWorkspace();
  }

  function refreshDatasetBaseline() {
    if (!dataset) return;
    cleanDatasetBaseline.current = structuredClone(dataset);
    setDatasetModified(false);
  }

  function updateDataset(nextDataset: Dataset) {
    setDataset(nextDataset);
    setDatasetModified(isDatasetModified(cleanDatasetBaseline.current ?? nextDataset, nextDataset));
  }

  function beginDatasetTitleEdit(trigger: HTMLButtonElement) {
    setDatasetTitleDraft(metadata?.title ?? "");
    datasetTitleEditTriggerRef.current = trigger;
    setDatasetTitleEditing(true);
  }

  function finishDatasetTitleEdit() {
    setDatasetTitleEditing(false);
    setDatasetTitleDraft("");
    restoreDatasetTitleFocusRef.current = true;
  }

  function saveDatasetTitle() {
    if (!dataset) return;
    updateDataset(updateDatasetTitle(dataset, datasetTitleDraft));
    finishDatasetTitleEdit();
  }

  function cancelDatasetTitleEdit() {
    finishDatasetTitleEdit();
  }

  function requestDatasetReplacement(candidate: Dataset, trigger: HTMLButtonElement | null | undefined, source: DatasetReplacementSource) {
    if (pendingDatasetReplacement) return;
    if (trigger) replacementTriggerRef.current = trigger;
    const decision = decideDatasetReplacement({ candidate, datasetModified, pendingUserWork });
    if (decision.action === "stage") {
      setPendingDatasetReplacement(decision.candidate);
      setPendingDatasetReplacementSource(source);
    } else acceptDataset(decision.candidate, source);
  }

  function cancelDatasetReplacement() {
    if (pendingDatasetReplacement) {
      restoreReplacementFocusRef.current = true;
      setPendingDatasetReplacement(cancelStagedDatasetReplacement(pendingDatasetReplacement).stagedCandidate);
    }
  }

  function discardAndContinueDatasetReplacement() {
    if (pendingDatasetReplacement) acceptDataset(discardAndContinueStagedDatasetReplacement(pendingDatasetReplacement).candidate);
  }

  function exportCurrentDataset(): boolean {
    if (!dataset) return false;
    const exportDiagnostics = validateDatasetForExport(dataset);
    setDiagnostics(exportDiagnostics);
    if (exportDiagnostics.some(({ severity }) => severity === "error")) {
      setMessage(translate(locale, "exportBlockedValidation"));
      return false;
    }
    if (exportDiagnostics.length > 0) setMessage(translate(locale, "exportWithWarnings"));
    const blob = new Blob([serializeDataset(dataset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "e2r-dataset.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    refreshDatasetBaseline();
    return true;
  }

  function exportAndContinueDatasetReplacement() {
    if (!pendingDatasetReplacement || pendingUserWork || !exportCurrentDataset()) return;
    acceptDataset(pendingDatasetReplacement);
  }

  function exportDatasetOnly() {
    exportCurrentDataset();
  }

  function open(raw: string, trigger?: HTMLButtonElement | null, source: DatasetReplacementSource = "local"): OpenDatasetResult {
    const result = loadDataset(raw);
    setDiagnostics(result.diagnostics);
    if (result.parseError) {
      setMessage(translate(locale, "jsonLoadFailure"));
      return { status: "parse-error" };
    }
    const candidate = candidateFromLoadResult(result);
    if (!candidate) {
      setMessage(translate(locale, "datasetValidationFailure"));
      return { status: "validation-error" };
    }
    requestDatasetReplacement(candidate, trigger, source);
    setMessage("");
    return { status: "accepted-or-staged" };
  }

  async function openSample(trigger?: HTMLButtonElement | null) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}lighthouse-restoration-demo.${locale}.e2r.json`);
      if (!response.ok) throw new Error(`Sample request failed: ${response.status}`);
      open(await response.text(), trigger, "sample");
    } catch {
      setMessage(translate(locale, "sampleDatasetLoadFailure"));
    }
  }

  function enterWorkspace() {
    setView("workspace");
    window.history.pushState({ liaisonScapeView: "workspace" }, "", window.location.href);
  }

  function goHomeFromWorkspace(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (view === "home") return;
    setView("home");
    window.history.pushState({ liaisonScapeView: "home" }, "", window.location.href);
  }

  function startNewDataset(trigger?: HTMLButtonElement | null) {
    requestDatasetReplacement(structuredClone(emptyDataset), trigger, "new");
  }

  const replacementDialog = dataset && pendingDatasetReplacement
    ? <DatasetReplacementDialog locale={locale} datasetModified={datasetModified} pendingUserWork={pendingUserWork} onCancel={cancelDatasetReplacement} onDiscard={discardAndContinueDatasetReplacement} onExportAndContinue={exportAndContinueDatasetReplacement} onExportDataset={exportDatasetOnly} />
    : null;

  if (view === "home") return (
    <div className="app-frame home-page">
      <header className="app-header">
        <a className="app-brand" href={import.meta.env.BASE_URL}>LiaisonScape</a>
        <div className="header-actions">
          {locale === "ja"
            ? <button type="button" className="locale-button" onClick={() => setLocale("en")}>English</button>
            : <button type="button" className="locale-button" onClick={() => setLocale("ja")}>日本語</button>}
        </div>
      </header>
      <main className="home-content">
        <h1 tabIndex={-1}>{translate(locale, "getStarted")}</h1>
        <p className="home-description">{translate(locale, "homeDescription")}</p>
        {startupHandoffFailure && <p className="home-message" role="alert">{translate(locale, startupHandoffFailure === "invalid-fragment" ? "handoffInvalid" : startupHandoffFailure === "fetch-failed" ? "handoffFetchFailure" : startupHandoffFailure === "parse-failed" ? "jsonLoadFailure" : "datasetValidationFailure")}</p>}
        <div className="home-actions">
          {dataset && <button type="button" onClick={enterWorkspace}>{translate(locale, "continueEditing")}</button>}
          <button type="button" disabled={Boolean(pendingDatasetReplacement)} onClick={(event) => startNewDataset(event.currentTarget)}>{translate(locale, "newDataset")}</button>
          <button type="button" className="open-dataset-button" disabled={Boolean(pendingDatasetReplacement)} onClick={(event) => { replacementTriggerRef.current = event.currentTarget; homeOpenFileInputRef.current?.click(); }}>{translate(locale, "openDataset")}</button>
          <input
            ref={homeOpenFileInputRef}
            className="file-input-hidden"
            type="file" tabIndex={-1} disabled={Boolean(pendingDatasetReplacement)} accept="application/json,.json,.e2r.json"
            onChange={(event) => { const file = event.target.files?.[0]; const trigger = replacementTriggerRef.current; if (file) void file.text().then((raw) => open(raw, trigger)); }}
          />
          <div className="sample-action">
            <button type="button" disabled={Boolean(pendingDatasetReplacement)} onClick={(event) => void openSample(event.currentTarget)}>{translate(locale, "openSampleDataset")}</button>
          </div>
        </div>
        <nav className="home-guides" aria-label={translate(locale, "guides")}>
          <a
            href={locale === "ja"
              ? "https://github.com/sukoyaka-dopeness/e2r-liaison-scape/blob/main/docs/user-guide-ja.md"
              : "https://github.com/sukoyaka-dopeness/e2r-liaison-scape/blob/main/docs/user-guide-en.md"}
            target="_blank"
            rel="noreferrer"
          >
            {translate(locale, "userGuide")}
          </a>
        </nav>
      </main>
      <footer className="app-footer home-footer">
        <small>{translate(locale, "footerDescriptor")}</small>
        <button type="button" className="credits-button" onClick={(event) => { creditsTriggerRef.current = event.currentTarget; setCreditsOpen(true); }}>{translate(locale, "credits")}</button>
      </footer>
      {creditsOpen && <CreditsDialog locale={locale} onClose={() => setCreditsOpen(false)} />}
      {replacementDialog}
    </div>
  );

  function nodePosition(node: GraphNode) { return positions[node.id] ?? node; }
  function graphPointForPointer(clientX: number, clientY: number) {
    const svg = graphRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return graphPointFromPointer(
      { clientX, clientY },
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: 800, height: 500 },
      scale,
      pan,
    );
  }

  function relationTargetAt(point: { x: number; y: number }, sourceId: string) {
    const target = graph.nodes.find((node) => node.id !== sourceId && Math.hypot((positions[node.id]?.x ?? node.x) - point.x, (positions[node.id]?.y ?? node.y) - point.y) <= 40);
    if (target) return target.id;
    const source = graph.nodes.find((node) => node.id === sourceId);
    if (source && Math.hypot((positions[source.id]?.x ?? source.x) - point.x, (positions[source.id]?.y ?? source.y) - point.y) <= 40) return source.id;
    return null;
  }

  function startRelationCreation(event: React.PointerEvent<SVGCircleElement>, sourceId: string) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = graphPointForPointer(event.clientX, event.clientY);
    if (!point) return;
    setRelationCreationPreview({ sourceId, point, targetId: sourceId });
    startGraphPointer(event, { kind: "relation-create", id: sourceId });
  }

  function cancelLongPress() {
    const pending = longPressRef.current;
    if (pending) window.clearTimeout(pending.timer);
    longPressRef.current = null;
  }
  function startLongPress(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse") return;
    suppressNextContextMenuRef.current = false;
    if (longPressRef.current || pointersRef.current.size > 0) {
      cancelLongPress();
      if (pointersRef.current.size > 0) return;
    }
    const target = event.target;
    const element = target instanceof Element ? target : null;
    const entityElement = element?.closest<SVGGElement>(".node");
    const entityLabelElement = element?.closest<SVGGElement>(".node-label-group");
    const relationElement = element?.closest<SVGGElement>(".edge-group, .edge-label-group");
    const kind: "canvas" | "entity" | "node-label" | "relation-path" | "relation-label" = entityLabelElement ? "node-label" : entityElement ? "entity" : relationElement?.classList.contains("edge-label-group") ? "relation-label" : relationElement ? "relation-path" : "canvas";
    const id = entityElement?.getAttribute("data-entity-id") ?? entityLabelElement?.getAttribute("data-entity-id") ?? relationElement?.getAttribute("data-relation-id") ?? undefined;
    const pending = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, kind, id, canceled: false, timer: 0 };
    pending.timer = window.setTimeout(() => {
      const current = longPressRef.current;
      if (!current || current.pointerId !== event.pointerId || current.canceled) return;
      if (!canCompleteLongPress(pointersRef.current.size <= 1, current.canceled) || !isLongPress(500, 0)) return;
      longPressClaimedRef.current = event.pointerId;
      suppressNextContextMenuRef.current = true;
      window.setTimeout(() => { suppressNextContextMenuRef.current = false; }, 1000);
      dragRef.current = null;
      if (current.kind === "canvas") openCanvasContextAt(event.clientX, event.clientY);
      else if (current.id) openObjectContextMenu(current.kind, current.id, event.clientX, event.clientY);
    }, 500);
    longPressRef.current = pending;
  }

  function updateLongPress(event: React.PointerEvent<SVGSVGElement>) {
    const pending = longPressRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 8) cancelLongPress();
  }

  function finishLongPress(event: React.PointerEvent<SVGSVGElement>) {
    if (longPressRef.current?.pointerId === event.pointerId) cancelLongPress();
  }

  function moveViewportToolbar(event: React.PointerEvent<HTMLButtonElement>) {
    const graphElement = graphRef.current;
    const toolbar = viewportToolbarRef.current;
    const drag = viewportToolbarDragRef.current;
    if (!graphElement || !toolbar || !drag) return;
    const graphRect = graphElement.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    setViewportToolbarPosition({
      x: Math.max(0, Math.min(event.clientX - graphRect.left - drag.offsetX, graphRect.width - toolbarRect.width)),
      y: Math.max(0, Math.min(event.clientY - graphRect.top - drag.offsetY, graphRect.height - toolbarRect.height)),
    });
  }
  function startViewportToolbarDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const toolbar = viewportToolbarRef.current;
    const graphElement = graphRef.current;
    if (!toolbar || !graphElement) return;
    event.preventDefault();
    event.stopPropagation();
    const graphRect = graphElement.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const currentPosition = viewportToolbarPosition ?? { x: toolbarRect.left - graphRect.left, y: toolbarRect.top - graphRect.top };
    setViewportToolbarPosition(currentPosition);
    viewportToolbarDragRef.current = { offsetX: event.clientX - graphRect.left - currentPosition.x, offsetY: event.clientY - graphRect.top - currentPosition.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function endViewportToolbarDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    viewportToolbarDragRef.current = null;
  }
  function applyEdgeCurveDrag(id: string, dx: number, dy: number) {
    const edge = graph.edges.find(({ id: edgeId }) => edgeId === id);
    if (!edge) return;
    if (edge.sourceId === edge.targetId) {
      const node = nodePosition(nodeMap.get(edge.sourceId)!);
      const route = routedEdges.find(({ id: edgeId }) => edgeId === id);
      if (route) {
        const desired = { x: route.controlPoint.x + dx, y: route.controlPoint.y + dy };
        const distance = Math.max(70, Math.hypot(desired.x - node.x, desired.y - node.y));
        const sidewaysDistance = Math.sin(Math.PI / 4) * 32;
        const outwardDistance = Math.cos(Math.PI / 4) * 32;
        const remaining = Math.max(1, distance - outwardDistance);
        const radius = Math.max(38, Math.min(180, (remaining * remaining + sidewaysDistance * sidewaysDistance) / (2 * remaining)));
        setSelfLoopOverrides((value) => ({ ...value, [id]: { orientation: Math.atan2(desired.y - node.y, desired.x - node.x), radius } }));
      }
      return;
    }
    const source = nodePosition(nodeMap.get(edge.sourceId)!);
    const target = nodePosition(nodeMap.get(edge.targetId)!);
    const length = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y));
    const normalX = -(target.y - source.y) / length;
    const normalY = (target.x - source.x) / length;
    setEdgeCurveOffsets((value) => ({ ...value, [id]: (value[id] ?? 0) + normalX * dx + normalY * dy }));
  }
  function restoreEdgeCurveDrag() {
    const start = edgeCurveDragStartRef.current;
    if (!start) return;
    if (start.offset === undefined) setEdgeCurveOffsets((value) => { const next = { ...value }; delete next[start.id]; return next; });
    else setEdgeCurveOffsets((value) => ({ ...value, [start.id]: start.offset! }));
    if (start.selfLoop === undefined) setSelfLoopOverrides((value) => { const next = { ...value }; delete next[start.id]; return next; });
    else setSelfLoopOverrides((value) => ({ ...value, [start.id]: start.selfLoop! }));
  }
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
    if (drag.kind === "relation-create" && drag.id) {
      const point = graphPointForPointer(event.clientX, event.clientY);
      if (point) setRelationCreationPreview({ sourceId: drag.id, point, targetId: relationTargetAt(point, drag.id) });
      return;
    }
    const previousPoint = graphPointForPointer(drag.x, drag.y);
    const currentPoint = graphPointForPointer(event.clientX, event.clientY);
    if (!previousPoint || !currentPoint) return;
    const dx = currentPoint.x - previousPoint.x;
    const dy = currentPoint.y - previousPoint.y;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, moved };
    if (drag.kind === "canvas") setPan((value) => ({ x: value.x + dx * scale, y: value.y + dy * scale }));
    else if (drag.kind === "edge" && drag.id && drag.button === 0) {
      if (moved) { dragRef.current = { ...dragRef.current!, kind: "edge-curve" }; applyOriginAnchoredEdgeCurveDrag(dragRef.current!, currentPoint); }
    }
    else if (drag.kind === "node" && drag.id && moved && drag.startNodePosition && drag.startGraphPoint) { setCoordinatesDirty(true); setPositions((value) => ({ ...value, [drag.id!]: { ...drag.startNodePosition!, x: drag.startNodePosition!.x + currentPoint.x - drag.startGraphPoint!.x, y: drag.startNodePosition!.y + currentPoint.y - drag.startGraphPoint!.y } })); }
    else if (drag.kind === "node-label" && drag.id && moved) {
      const node = nodeMap.get(drag.id);
      const current = nodeLabelPlacements.get(drag.id);
      if (node && current) {
        const position = nodePosition(node);
        const origin = drag.startLabelPosition ?? current;
        const total = drag.startGraphPoint ? { x: origin.x + currentPoint.x - drag.startGraphPoint.x, y: origin.y + currentPoint.y - drag.startGraphPoint.y } : { x: current.x + dx, y: current.y + dy };
        manualNodeLabelOffsets.current.set(drag.id, deriveManualNodeLabelOffset(position, total));
        setManualLabelRevision((value) => value + 1);
      }
    }
    else if (drag.kind === "edge-label" && drag.id && moved) {
      const edge = routedEdges.find(({ id }) => id === drag.id);
      const current = edgeLabelPlacements.get(drag.id);
      if (edge && current) {
        const origin = drag.startLabelPosition ?? current;
        const label = drag.startGraphPoint ? { x: origin.x + currentPoint.x - drag.startGraphPoint.x, y: origin.y + currentPoint.y - drag.startGraphPoint.y } : { x: current.x + dx, y: current.y + dy };
        manualRelationLabelAnchors.current.set(drag.id, deriveManualRelationLabelAnchor(edge.samples, label));
        setManualLabelRevision((value) => value + 1);
      }
    }
    else if (drag.kind === "edge-curve" && drag.id && moved) applyOriginAnchoredEdgeCurveDrag(dragRef.current!, currentPoint);
  }

  function startGraphPointer(
    event: React.PointerEvent<SVGElement>,
    drag: { kind: "canvas" | "node" | "edge" | "node-label" | "edge-label" | "edge-curve" | "relation-create"; id?: string },
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
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

    const startGraphPoint = graphPointForPointer(event.clientX, event.clientY) ?? undefined;
    const startNodePosition = drag.id && drag.kind === "node" ? nodePosition(nodeMap.get(drag.id)!) : undefined;
    const startLabelPosition = drag.id && drag.kind === "node-label" ? nodeLabelPlacements.get(drag.id) : drag.id && drag.kind === "edge-label" ? edgeLabelPlacements.get(drag.id) : undefined;
    const startEdge = drag.id ? graph.edges.find(({ id }) => id === drag.id) : undefined;
    const startSource = startEdge ? nodePosition(nodeMap.get(startEdge.sourceId)!) : undefined;
    const startTarget = startEdge ? nodePosition(nodeMap.get(startEdge.targetId)!) : undefined;
    const edgeLength = startSource && startTarget ? Math.max(1, Math.hypot(startTarget.x - startSource.x, startTarget.y - startSource.y)) : 1;
    const startCurveNormal = startEdge && startSource && startTarget && startEdge.sourceId !== startEdge.targetId
      ? { x: -(startTarget.y - startSource.y) / edgeLength, y: (startTarget.x - startSource.x) / edgeLength }
      : undefined;
    const startControlPoint = drag.id ? routedEdges.find(({ id }) => id === drag.id)?.controlPoint : undefined;
    const startRouteSamples = drag.id ? routedEdges.find(({ id }) => id === drag.id)?.samples : undefined;
    const startGrabFraction = startGraphPoint && startRouteSamples ? nearestPolylineArcFraction(startRouteSamples, startGraphPoint) ?? undefined : undefined;
    const distinctEndpoints = Boolean(startSource && startTarget
      && (startSource.x !== startTarget.x || startSource.y !== startTarget.y));
    const automaticParallelRoute = Boolean(startEdge && startEdge.parallelCount > 1 && distinctEndpoints);
    const startCurveOffset = drag.id && edgeCurveOffsets[drag.id] !== undefined
      ? edgeCurveOffsets[drag.id]
      : automaticParallelRoute && startSource && startTarget && startControlPoint
        ? curveOffsetFromControlPoint(startSource, startTarget, startControlPoint) ?? 0
        : 0;
    dragRef.current = { ...drag, button: event.button, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, startGraphPoint, startNodePosition, startLabelPosition, startCurveOffset, startCurveNormal, startControlPoint, startGrabFraction, startRouteSamples };
  }

  function endGraphPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (longPressClaimedRef.current === event.pointerId) {
      longPressClaimedRef.current = null;
      pointersRef.current.delete(event.pointerId);
      dragRef.current = null;
      pinchRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const drag = dragRef.current;
    const wasPinch = pinchRef.current !== null || pointersRef.current.size >= 2;
    if (drag?.kind === "edge-curve") {
      if (event.type === "pointercancel") restoreEdgeCurveDrag();
      edgeCurveDragStartRef.current = null;
      pointersRef.current.delete(event.pointerId);
      dragRef.current = null;
      pinchRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (drag?.kind === "relation-create") {
      const preview = relationCreationPreview;
      if (preview && preview.sourceId === drag.id && preview.targetId) {
        openCreation("relation", null, { sourceId: preview.sourceId, targetId: preview.targetId });
      }
      setRelationCreationPreview(null);
      pointersRef.current.delete(event.pointerId);
      dragRef.current = null;
      pinchRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const isNodeTap = drag?.kind === "node"
      && !drag.moved
      && pointersRef.current.size === 1
      && pinchRef.current === null;
    const isEdgeTap = drag?.kind === "edge"
      && !drag.moved
      && pointersRef.current.size === 1
      && pinchRef.current === null;
    const isPrimaryPointer = drag?.button === 0;
    const isNodeLabelTap = drag?.kind === "node-label" && isPrimaryPointer && !drag.moved && pointersRef.current.size === 1 && pinchRef.current === null;
    const isEdgeLabelTap = drag?.kind === "edge-label" && isPrimaryPointer && !drag.moved && pointersRef.current.size === 1 && pinchRef.current === null;
    const isCanvasTap = drag?.kind === "canvas" && !drag.moved && pointersRef.current.size === 1 && pinchRef.current === null && event.button === 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if ((isNodeTap || isNodeLabelTap) && drag.id) {
      const entity = dataset?.entities.find(({ id }) => id === drag.id);
      setSelectedId(drag.id);
      setSelectedRelationId(null);
      setDetailOpen(false);
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
      setDetailOpen(false);
      setRelationNameDraft(typeof relation?.name === "string" ? relation.name : "");
      setRelationDescriptionDraft(typeof relation?.description === "string" ? relation.description : "");
      setRelationSourceDraft(typeof relation?.sourceId === "string" ? relation.sourceId : "");
      setRelationTargetDraft(typeof relation?.targetId === "string" ? relation.targetId : "");
      setEdgeLayerOrder((value) => bringToFront(value, drag.id!));
    }
    if (isCanvasTap) {
      setSelectedId(null);
      setSelectedRelationId(null);
    }
    if (wasPinch) {
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
      return;
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
        setMessage(translate(locale, "coordinateDraftWriteRefusal"));
        return;
      }
      setMessage(translate(locale, "coordinatePayloadWriteRefusal"));
      return;
    }
    updateDataset(saved);
    setCoordinatesDirty(false);
    setMessage(translate(locale, "coordinateSaveSuccess"));
  }

  function migrateCoordinatesToDraft() {
    if (!dataset) return;
    const result = migrateCoordinatePrototypeToDraft(dataset);
    setDiagnostics(result.diagnostics);
    if (!result.migrated) {
      if (result.readiness.ready) return;
      setMessage(translate(locale, "coordinateDraftMigrationRefusal"));
      return;
    }
    updateDataset(result.dataset);
    const coordinateState = preservePendingCoordinates({ positions, coordinatesDirty, storedPositions: getStoredCoordinates(result.dataset) });
    setPositions(coordinateState.positions);
    setCoordinatesDirty(coordinateState.coordinatesDirty);
    setMessage(translate(locale, "coordinateDraftMigrationSuccess"));
  }

  function migrateSpaceToLiaisonScape() {
    if (!dataset) return;
    const result = migrateLinkscapeSpaceToLiaisonScape(dataset);
    setDiagnostics(result.diagnostics);
    if (!result.migrated) {
      setMessage(translate(locale, "spaceMigrationRefusal"));
      return;
    }
    updateDataset(result.dataset);
    const coordinateState = preservePendingCoordinates({ positions, coordinatesDirty, storedPositions: getStoredCoordinates(result.dataset) });
    setPositions(coordinateState.positions);
    setCoordinatesDirty(coordinateState.coordinatesDirty);
    setMessage(translate(locale, "spaceMigrationSuccess"));
  }

  function saveRelationDetails() {
    if (!dataset || !selectedRelationId) return;
    const current = getRelationDetail(dataset, selectedRelationId);
    if (!current) { setMessage(formatRelationUpdateRefusal(locale, "relation_not_found")); return; }
    const result = updateRelation(dataset, selectedRelationId, {
      sourceId: relationSourceDraft,
      targetId: relationTargetDraft,
      name: relationNameDraft,
      description: relationDescriptionDraft,
    });
    if ("refusal" in result) { setMessage(formatRelationUpdateRefusal(locale, result.refusal)); return; }
    updateDataset(result.dataset);
    setDetailOpen(false);
    setMessage("");
  }

  function openCreation(mode: "entity" | "relation", placement: { x: number; y: number } | null = null, endpoints: { sourceId: string; targetId: string } | null = null) {
    const selectedEntity = mode === "relation" ? endpoints?.sourceId ?? selectedId ?? "" : "";
    setPendingEntityPlacement(mode === "entity" ? placement : null);
    setCreationMode(mode); setCreationName(""); setCreationDescription(""); setCreationSource(selectedEntity); setCreationTarget(mode === "relation" ? endpoints?.targetId ?? selectedEntity : ""); setDetailOpen(false);
  }

  function openCanvasContextAt(clientX: number, clientY: number) {
    const svg = graphRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const point = graphPointFromPointer(
      { clientX, clientY },
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: 800, height: 500 },
      scale,
      pan,
    );
    if (!point) return;
    setHoveredPlacement(null);
    setContextMenu({ ...createCanvasContextMenu(point), clientX, clientY });
  }

  function openCanvasContextMenu(event: React.MouseEvent<SVGSVGElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest(".node, .edge-group, .edge-label-group")) return;
    event.preventDefault();
    if (suppressNextContextMenuRef.current) { suppressNextContextMenuRef.current = false; return; }
    openCanvasContextAt(event.clientX, event.clientY);
  }
  function applyOriginAnchoredEdgeCurveDrag(drag: NonNullable<typeof dragRef.current>, currentPoint: { x: number; y: number }) {
    if (!drag.id || !drag.startGraphPoint) return;
    const total = draggedPointFromOrigin({ x: 0, y: 0 }, drag.startGraphPoint, currentPoint);
    const edge = graph.edges.find(({ id }) => id === drag.id);
    if (!edge) return;
    if (edge.sourceId === edge.targetId && drag.startControlPoint) {
      const node = nodePosition(nodeMap.get(edge.sourceId)!);
      const desired = { x: drag.startControlPoint.x + total.x, y: drag.startControlPoint.y + total.y };
      const distance = Math.max(70, Math.hypot(desired.x - node.x, desired.y - node.y));
      const sidewaysDistance = Math.sin(Math.PI / 4) * 32;
      const outwardDistance = Math.cos(Math.PI / 4) * 32;
      const remaining = Math.max(1, distance - outwardDistance);
      const radius = Math.max(38, Math.min(180, (remaining * remaining + sidewaysDistance * sidewaysDistance) / (2 * remaining)));
      setSelfLoopOverrides((value) => ({ ...value, [drag.id!]: { orientation: Math.atan2(desired.y - node.y, desired.x - node.x), radius } }));
    } else if (drag.startCurveNormal && drag.startGrabFraction !== undefined && drag.startRouteSamples) {
      const normal = drag.startCurveNormal;
      const source = nodePosition(nodeMap.get(edge.sourceId)!);
      const target = nodePosition(nodeMap.get(edge.targetId)!);
      const length = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y));
      const hasObstacle = graph.nodes.filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId).some((node) => {
        const obstacle = positions[node.id] ?? node;
        const projection = Math.max(0, Math.min(1, ((obstacle.x - source.x) * (target.x - source.x) + (obstacle.y - source.y) * (target.y - source.y)) / (length * length)));
        return Math.hypot(obstacle.x - (source.x + (target.x - source.x) * projection), obstacle.y - (source.y + (target.y - source.y) * projection)) < 60;
      });
      const parallelSolverEligible = routedEdges.find(({ id }) => id === edge.id)?.parallelSolverEligible ?? false;
      const solved = (edge.parallelCount === 1 && !hasObstacle) || parallelSolverEligible ? solveVisibleRouteOffset({
        startOffset: drag.startCurveOffset ?? 0,
        startSamples: drag.startRouteSamples,
        grabFraction: drag.startGrabFraction,
        normal,
        desiredNormalDelta: normal.x * total.x + normal.y * total.y,
        routeAtOffset: (offset) => routeGraphEdge(source, target, edge.parallelIndex, edge.parallelCount, [], [], false, 0, offset).samples,
        isCandidateSafe: parallelSolverEligible ? (samples) => !routeSamplesHaveNodeInfluence(samples, graph.nodes
          .filter((node) => node.id !== edge.sourceId && node.id !== edge.targetId)
          .map((node) => positions[node.id] ?? node)) : undefined,
      }) : null;
      const desiredNormalDelta = normal.x * total.x + normal.y * total.y;
      const nextOffset = Math.abs(desiredNormalDelta) < 1e-9
        ? drag.startCurveOffset ?? 0
        : solved ?? (drag.lastValidOffset !== undefined && drag.lastDesiredNormalDelta !== undefined && drag.lastValidGain !== undefined
          ? boundedDragContinuationOffset({ lastOffset: drag.lastValidOffset, lastDesiredNormalDelta: drag.lastDesiredNormalDelta, lastGain: drag.lastValidGain, desiredNormalDelta })
          : null) ?? (drag.startCurveOffset ?? 0) + desiredNormalDelta;
      const previousDesired = drag.lastDesiredNormalDelta ?? 0;
      const previousOffset = drag.lastValidOffset ?? drag.startCurveOffset ?? 0;
      const observedGain = Math.abs(desiredNormalDelta - previousDesired) > 1e-9
        ? (nextOffset - previousOffset) / (desiredNormalDelta - previousDesired)
        : drag.lastValidGain;
      dragRef.current = { ...dragRef.current!, lastDesiredNormalDelta: desiredNormalDelta, lastValidOffset: nextOffset, lastValidGain: Number.isFinite(observedGain ?? NaN) && Math.abs(observedGain!) > 0.05 ? observedGain : drag.lastValidGain };
      setEdgeCurveOffsets((value) => ({ ...value, [drag.id!]: nextOffset }));
    }
  }

  function openObjectContextMenu(kind: "entity" | "node-label" | "relation-path" | "relation-label", id: string, clientX: number, clientY: number) {
    setHoveredPlacement(null);
    setContextMenu({ kind, ...(kind.startsWith("relation") ? { relationId: id } : { entityId: id }), clientX, clientY } as ContextMenu);
  }

  function openObjectContextFromPointer(kind: "entity" | "node-label" | "relation-path" | "relation-label", id: string, event: React.MouseEvent<SVGGElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (suppressNextContextMenuRef.current) { suppressNextContextMenuRef.current = false; return; }
    openObjectContextMenu(kind, id, event.clientX, event.clientY);
  }

  function chooseCanvasAddEntity() {
    if (!contextMenu || contextMenu.kind !== "canvas") return;
    openCreation("entity", contextMenu.point);
    setContextMenu(null);
  }

  function saveCreation() {
    if (!dataset || !creationMode) return;
    if (creationMode === "entity") {
      const placement = pendingEntityPlacement;
      const result = createEntity(dataset, { name: creationName, description: creationDescription });
      const created = result.dataset.entities.find(({ id }) => id === result.entityId)!;
      updateDataset(result.dataset); setSelectedId(result.entityId); setSelectedRelationId(null); setCreationMode(null); setPendingEntityPlacement(null);
      const automaticPlacement = graphPointFromViewportCenter({ width: 800, height: 500 }, scale, pan);
      setPositions((value) => applyEntityCreationPlacement({
        positions: value,
        entityId: result.entityId,
        explicitPlacement: placement,
        automaticPlacement,
        coordinatesDirty,
      }).positions);
      if (placement !== null) setCoordinatesDirty(true);
      setNodeLayerOrder((value) => bringToFront(value, result.entityId));
      setEntityNameDraft(typeof created.name === "string" ? created.name : ""); setEntityDescriptionDraft(typeof created.description === "string" ? created.description : "");
      setMessage(""); return;
    }
    const result = createRelation(dataset, { sourceId: creationSource, targetId: creationTarget, name: creationName, description: creationDescription });
    if (!("relationId" in result)) { setMessage(formatRelationCreationRefusal(locale, result.refusal)); return; }
    updateDataset(result.dataset); setSelectedRelationId(result.relationId); setSelectedId(null); setCreationMode(null); setMessage("");
  }

  function removeSelectedRelation() {
    if (!dataset || !selectedRelationId) return;
    const assessment = assessRelationDeletion(dataset, selectedRelationId);
    if (!assessment.ready) { setMessage(formatRelationDeletionRefusal(locale, assessment.reason)); return; }
    setDeleteConfirmationId(selectedRelationId);
    setDetailOpen(false);
    setDeleteConfirmation("relation");
  }

  function removeSelectedEntity() {
    const entityId = selectedId ?? selectedDetail?.entity.id;
    if (!dataset || !entityId) return;
    const assessment = assessEntityDeletion(dataset, entityId);
    if (!assessment.ready) {
      setMessage(assessment.incidentRelationCount ? formatEntityIncidentWarning(locale, assessment.incidentRelationCount) : formatEntityDeletionRefusal(locale, assessment.reason));
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
      if (!result.deleted) { setMessage(formatRelationDeletionRefusal(locale, result.reason)); setDeleteConfirmation(null); return; }
      manualRelationLabelAnchors.current.delete(result.deletedId);
      updateDataset(result.dataset); setSelectedRelationId(null); setDetailOpen(false); setDeleteConfirmation(null); setMessage(""); return;
    }
    if (deleteConfirmation === "entity") {
      const result = deleteEntity(dataset, deleteConfirmationId);
      if (!result.deleted) { setMessage(formatEntityDeletionRefusal(locale, result.reason)); setDeleteConfirmation(null); return; }
      manualNodeLabelOffsets.current.delete(result.deletedId);
      updateDataset(result.dataset); setPositions((value) => { const next = { ...value }; delete next[result.deletedId]; return next; }); setSelectedId(null); setDetailOpen(false); setDeleteConfirmation(null); setMessage("");
    }
  }

  function saveEntityDetails() {
    if (!dataset || !selectedId) return;
    updateDataset(updateEntityDetails(dataset, selectedId, {
      name: entityNameDraft,
      description: entityDescriptionDraft,
    }));
    setDetailOpen(false);
    setMessage("");
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

  function openEntityDetail(entityId: string) {
    const entity = dataset?.entities.find(({ id }) => id === entityId);
    if (!entity) return;
    setSelectedId(entityId);
    setSelectedRelationId(null);
    setEntityNameDraft(typeof entity.name === "string" ? entity.name : "");
    setEntityDescriptionDraft(typeof entity.description === "string" ? entity.description : "");
    setDetailOpen(true);
  }

  function openRelationDetail(relationId: string) {
    const relation = dataset?.relations.find(({ id }) => id === relationId);
    if (!relation) return;
    setSelectedRelationId(relationId);
    setSelectedId(null);
    setRelationNameDraft(typeof relation.name === "string" ? relation.name : "");
    setRelationDescriptionDraft(typeof relation.description === "string" ? relation.description : "");
    setRelationSourceDraft(typeof relation.sourceId === "string" ? relation.sourceId : "");
    setRelationTargetDraft(typeof relation.targetId === "string" ? relation.targetId : "");
    setDetailOpen(true);
  }

  function openContextMenuDetails() {
    if (!contextMenu) return;
    if (contextMenu.kind === "entity" || contextMenu.kind === "node-label") openEntityDetail(contextMenu.entityId);
    else if (contextMenu.kind === "relation-path" || contextMenu.kind === "relation-label") openRelationDetail(contextMenu.relationId);
    setContextMenu(null);
  }

  function resetContextMenuPlacement() {
    if (!contextMenu) return;
    if (contextMenu.kind === "node-label") {
      manualNodeLabelOffsets.current.delete(contextMenu.entityId);
      setManualLabelRevision((value) => value + 1);
    } else if (contextMenu.kind === "relation-label") {
      manualRelationLabelAnchors.current.delete(contextMenu.relationId);
      setEdgeLabelOffsets((value) => { const next = { ...value }; delete next[contextMenu.relationId]; return next; });
      setManualLabelRevision((value) => value + 1);
    } else if (contextMenu.kind === "relation-path") {
      setEdgeCurveOffsets((value) => resetManualRelationRoute(value, contextMenu.relationId));
      setSelfLoopOverrides((value) => resetManualRelationRoute(value, contextMenu.relationId));
    }
    setContextMenu(null);
  }

  function resetView() {
    const fittedView = fitGraphView(graph.nodes.map(nodePosition), 800, 500);
    setScale(fittedView.scale);
    setPan(fittedView.pan);
    setSelectedId(null);
    setSelectedRelationId(null);
    setDetailOpen(false);
    setEdgeLabelOffsets({});
  }

  function exportDataset() { exportCurrentDataset(); }

  function closeMaintenanceMenu() {
    if (maintenanceMenuRef.current?.open) maintenanceMenuRef.current.open = false;
    setMaintenanceMenuOpen(false);
  }

  function handleMaintenanceMenuKeyDown(event: React.KeyboardEvent<HTMLDetailsElement>) {
    const items = Array.from(
      maintenanceMenuRef.current?.querySelectorAll<HTMLButtonElement>(".maintenance-menu__items > button:not(:disabled)") ?? [],
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Tab") {
      closeMaintenanceMenu();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMaintenanceMenu();
      maintenanceMenuSummaryRef.current?.focus();
      return;
    }

    if (items.length === 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <a className="app-brand" href={import.meta.env.BASE_URL} onClick={goHomeFromWorkspace}>LiaisonScape</a>
        <div className="header-actions">
          <a className="header-home-button" href={import.meta.env.BASE_URL} onClick={goHomeFromWorkspace}>{translate(locale, "home")}</a>
          {locale === "ja"
            ? <button type="button" className="locale-button" onClick={() => setLocale("en")}>English</button>
            : <button type="button" className="locale-button" onClick={() => setLocale("ja")}>日本語</button>}
        </div>
      </header>
      <main className="app-content">
        <div className="page-header">
          <h1>Entity graph</h1>
          <p>Entity-first E2R relationship graph.</p>
        </div>
        <div className="dataset-actions">
          <input
            ref={workspaceOpenFileInputRef}
            className="file-input-hidden"
            type="file" tabIndex={-1} disabled={Boolean(pendingDatasetReplacement)}
            accept="application/json,.json,.e2r.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              const trigger = replacementTriggerRef.current;
              if (file) void file.text().then((raw) => open(raw, trigger));
            }}
          />
          {dataset && <p className="graph-summary toolbar-graph-summary">{formatGraphSummary(locale, graph.nodes.length, graph.edges.length)}</p>}
          <div className="dataset-actions__buttons">
            <button type="button" disabled={!dataset} onClick={() => openCreation("entity")}>{translate(locale, "addEntity")}</button>
            <button type="button" disabled={!dataset} onClick={() => openCreation("relation")}>{translate(locale, "addRelation")}</button>
            <button type="button" className="desktop-secondary-action" disabled={!dataset || !coordinatesDirty} onClick={saveCoordinates}>{translate(locale, "saveCoordinates")}</button>
            <details ref={maintenanceMenuRef} className="maintenance-menu" onToggle={(event) => setMaintenanceMenuOpen(event.currentTarget.open)} onKeyDown={handleMaintenanceMenuKeyDown}>
              <summary ref={maintenanceMenuSummaryRef}>{translate(locale, "more")}</summary>
              <div className="maintenance-menu__items">
                <button type="button" disabled={Boolean(pendingDatasetReplacement)} onClick={(event) => { replacementTriggerRef.current = event.currentTarget; closeMaintenanceMenu(); workspaceOpenFileInputRef.current?.click(); }}>{translate(locale, "openWorkspaceDataset")}</button>
                <button type="button" disabled={!dataset} onClick={() => { closeMaintenanceMenu(); exportDataset(); }}>{translate(locale, "exportDataset")}</button>
                <button type="button" className="mobile-secondary-action" disabled={!dataset || !coordinatesDirty} onClick={() => { closeMaintenanceMenu(); saveCoordinates(); }}>{translate(locale, "saveCoordinates")}</button>
                <button type="button" disabled={!dataset || coordinateMigrationReadiness?.ready !== true} onClick={migrateCoordinatesToDraft}>{translate(locale, "migrateCoordinateDraft")}</button>
                <button type="button" disabled={!dataset || spaceMigrationReadiness?.ready !== true} onClick={migrateSpaceToLiaisonScape}>{translate(locale, "migrateLinkscapeCoordinates")}</button>
                <div className="mobile-secondary-action mobile-viewport-menu" aria-label={translate(locale, "graphViewControls")}>
                  <button type="button" onClick={() => setScale((value) => zoomScale(value, "out"))}>{translate(locale, "zoomOut")}</button>
                  <span aria-live="polite">{Math.round(scale * 100)}%</span>
                  <button type="button" onClick={() => setScale((value) => zoomScale(value, "in"))}>{translate(locale, "zoomIn")}</button>
                  <button type="button" onClick={resetView}>{translate(locale, "resetView")}</button>
                </div>
              </div>
            </details>
          </div>
        </div>
        {message && <p className="status-message" role="status">{message}</p>}
      {contextMenu && <div ref={contextMenuRef} className="canvas-context-menu context-menu" role="menu" aria-label={translate(locale, "canvasActions")} style={{ position: "fixed", left: contextMenuPosition?.left ?? contextMenu.clientX, top: contextMenuPosition?.top ?? contextMenu.clientY }} onPointerDown={(event) => event.stopPropagation()}>
        {contextMenu.kind === "canvas" ? <button type="button" role="menuitem" onClick={chooseCanvasAddEntity}>{translate(locale, "addEntity")}</button> : <>
          <button type="button" role="menuitem" onClick={openContextMenuDetails}>{translate(locale, "openDetails")}</button>
          {((contextMenu.kind === "node-label" && manualNodeLabelOffsets.current.has(contextMenu.entityId)) ||
            (contextMenu.kind === "relation-path" && (edgeCurveOffsets[contextMenu.relationId] !== undefined || selfLoopOverrides[contextMenu.relationId] !== undefined)) ||
            (contextMenu.kind === "relation-label" && manualRelationLabelAnchors.current.has(contextMenu.relationId))) &&
            <button type="button" role="menuitem" onClick={resetContextMenuPlacement}>{translate(locale, "automaticPlacementReset")}</button>}
        </>}
        <button type="button" role="menuitem" onClick={() => setContextMenu(null)}>{translate(locale, "cancel")}</button>
      </div>}
      {dataset && creationMode && (
        <CreationDialog
          locale={locale}
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
          onCancel={() => { setCreationMode(null); setPendingEntityPlacement(null); }}
        />
      )}
      {replacementDialog}
      {dataset && deleteConfirmation && <ConfirmationDialog locale={locale} subject={deleteConfirmation === "entity" ? "Entity" : "Relation"} onCancel={() => setDeleteConfirmation(null)} onConfirm={confirmDeletion} />}
      {dataset && (
        <dl className="dataset-metadata" aria-label={translate(locale, "datasetMetadata")}>
          <dt>{translate(locale, "datasetTitleVisible")}</dt>
          {datasetTitleEditing ? <dd className="dataset-title-editing">
            <input
              ref={datasetTitleInputRef}
              type="text"
              value={datasetTitleDraft}
              aria-label={translate(locale, "datasetTitleInput")}
              onChange={(event) => setDatasetTitleDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelDatasetTitleEdit(); } }}
            />
            <button type="button" onClick={saveDatasetTitle}>{translate(locale, "saveDatasetTitleVisible")}</button>
            <button type="button" onClick={cancelDatasetTitleEdit}>{translate(locale, "cancel")}</button>
          </dd> : <dd>
            <span>{metadata?.title ?? translate(locale, "untitled")}</span>
            <button type="button" onClick={(event) => beginDatasetTitleEdit(event.currentTarget)} aria-label={translate(locale, "editDatasetTitle")}>{translate(locale, "edit")}</button>
          </dd>}
          <dt>Dataset ID</dt><dd>{metadata?.datasetId ?? translate(locale, "datasetIdNotAssigned")}</dd>
        </dl>
      )}
      {diagnostics.length > 0 && (
        <ul aria-label={translate(locale, "validationDiagnostics")}>
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`}>
              <div>{formatDiagnosticSeverity(locale, diagnostic.severity)}</div>
              <div>{translate(locale, "diagnosticCodeLabel")}: {diagnostic.code}</div>
              <div>{translate(locale, "diagnosticPathLabel")}: {diagnostic.path}</div>
            </li>
          ))}
        </ul>
      )}
      {dataset && (
        <section className="graph-section">
          <h2>Graph</h2>
          <div ref={viewportToolbarRef} className="viewport-controls mobile-hide" aria-label={translate(locale, "graphViewControls")} style={viewportToolbarPosition ? { left: viewportToolbarPosition.x, top: viewportToolbarPosition.y, right: "auto" } : undefined}>
            <button type="button" className="viewport-toolbar-handle" aria-label={translate(locale, "moveZoomControls")} title={translate(locale, "moveZoomControls")} onPointerDown={startViewportToolbarDrag} onPointerMove={moveViewportToolbar} onPointerUp={endViewportToolbarDrag} onPointerCancel={endViewportToolbarDrag}>⠿</button>
            <button type="button" onClick={() => setScale((value) => zoomScale(value, "out"))}>{translate(locale, "zoomOut")}</button>
            <span aria-live="polite">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((value) => zoomScale(value, "in"))}>{translate(locale, "zoomIn")}</button>
            <button type="button" onClick={resetView}>{translate(locale, "resetView")}</button>
          </div>
          <svg
            ref={graphRef}
            className="graph"
            viewBox="0 0 800 500"
            role="img"
            aria-label={translate(locale, "entityRelationshipGraph")}
            onPointerDown={(event) => { startGraphPointer(event, { kind: "canvas" }); }}
            onPointerDownCapture={startLongPress}
            onPointerMove={onCanvasPointerMove}
            onPointerMoveCapture={updateLongPress}
            onPointerUp={endGraphPointer}
            onPointerUpCapture={finishLongPress}
            onPointerCancel={endGraphPointer}
            onPointerCancelCapture={finishLongPress}
            onContextMenu={openCanvasContextMenu}
          >
            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor" /></marker></defs>
            <g transform={centeredViewportTransform(scale, pan, 800, 500)}>
              {relationCreationPreview && (() => {
                const source = graph.nodes.find(({ id }) => id === relationCreationPreview.sourceId);
                if (!source) return null;
                const sourcePoint = nodePosition(source);
                return <line className={`relation-creation-preview${relationCreationPreview.targetId ? " valid" : ""}`} x1={sourcePoint.x} y1={sourcePoint.y} x2={relationCreationPreview.point.x} y2={relationCreationPreview.point.y} />;
              })()}
              {displayedEdges.map((edge) => {
                return <g
                  key={edge.id}
                  className={`edge-group${selectedRelationId === edge.id ? " selected" : ""}`}
                  data-relation-id={edge.id}
                   onContextMenu={(event) => openObjectContextFromPointer("relation-path", edge.id, event)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (event.pointerType === "mouse" && event.button !== 0) return;
                    setEdgeLayerOrder((value) => bringToFront(value, edge.id));
                    if (event.button === 0) {
                      if (selectedRelationId !== edge.id) {
                        setSelectedRelationId(edge.id);
                        setSelectedId(null);
                        setDetailOpen(false);
                      }
                      edgeCurveDragStartRef.current = { id: edge.id, offset: edgeCurveOffsets[edge.id], selfLoop: selfLoopOverrides[edge.id] };
                    }
                    startGraphPointer(event, { kind: "edge", id: edge.id });
                  }}
                >
                  <path d={edge.path} className="edge-halo" />
                  <path d={edge.path} className="edge" />
                  {(() => {
                    const arrowhead = getArrowheadGeometry(edge.samples, selectedRelationId === edge.id ? 2.75 : 2);
                    return <polygon
                      className="edge-arrowhead"
                      points={`${arrowhead.baseA.x},${arrowhead.baseA.y} ${arrowhead.baseB.x},${arrowhead.baseB.y} ${arrowhead.tip.x},${arrowhead.tip.y}`}
                    />;
                  })()}
                  <path
                    d={edge.path}
                    className="edge-hit-area"
                    onPointerEnter={(event) => setPlacementHover(event, "relation-route", edge.id)}
                    onPointerLeave={() => setHoveredPlacement((value) => value?.target === "relation-route" && value.id === edge.id ? null : value)}
                  />
                </g>;
              })}
              {displayedEdges.map((edge) => {
                if (!edge.label) return null;
                const labelPoint = displayedEdgeLabelPlacements.get(edge.id) ?? edge.labelPoint;
                return <g
                  key={`label-${edge.id}`}
                   className="edge-label-group"
                   data-relation-id={edge.id}
                   transform={`translate(${manualRelationLabelAnchors.current.has(edge.id) ? 0 : (edgeLabelOffsets[edge.id]?.x ?? 0)} ${manualRelationLabelAnchors.current.has(edge.id) ? 0 : (edgeLabelOffsets[edge.id]?.y ?? 0)})`}
                   onContextMenuCapture={(event) => openObjectContextFromPointer("relation-label", edge.id, event)}
                   onContextMenu={(event) => openObjectContextFromPointer("relation-label", edge.id, event)}
                  onPointerDown={(event) => { event.stopPropagation(); startGraphPointer(event, { kind: "edge-label", id: edge.id }); }}
                >
                  <g transform={`translate(${labelPoint.x} ${labelPoint.y})`}>
                    <rect
                      className="label-drag-hit"
                      x={-Math.max(24, edge.label.length * 3.5)}
                      y={-18}
                      width={Math.max(48, edge.label.length * 7)}
                      height="22"
                      rx="3"
                      onContextMenu={(event) => openObjectContextFromPointer("relation-label", edge.id, event)}
                      onPointerEnter={(event) => setPlacementHover(event, "relation-label", edge.id)}
                      onPointerLeave={() => setHoveredPlacement((value) => value?.target === "relation-label" && value.id === edge.id ? null : value)}
                    />
                    <text className="edge-label" x="0" y="-5" aria-hidden="true">{edge.label}</text>
                  </g>
                </g>;
              })}
              {displayedNodes.map((node) => { const position = nodePosition(node); return (
                 <g key={node.id} className={`node ${selectedId === node.id ? "selected" : ""}${selectedId === node.id || hoveredEntityId === node.id || relationCreationPreview?.sourceId === node.id ? " handle-visible" : ""}`} data-entity-id={node.id} transform={`translate(${position.x} ${position.y})`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredEntityId(node.id); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredEntityId((value) => value === node.id ? null : value); }} onContextMenu={(event) => openObjectContextFromPointer("entity", node.id, event)} onPointerDown={(event) => { event.stopPropagation(); if (event.pointerType === "mouse" && event.button !== 0) return; setNodeLayerOrder((value) => bringToFront(value, node.id)); startGraphPointer(event, { kind: "node", id: node.id }); }}>
                  <rect className="connection-handle-corridor" x="24" y="4" width="20" height="28" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} />
                  <circle className="connection-hit-target" cx="34" cy="16" r="12" onPointerDown={(event) => startRelationCreation(event, node.id)} />
                  <circle className="connection-handle" cx="34" cy="16" r="8.5" onPointerDown={(event) => startRelationCreation(event, node.id)} />
                  <rect
                    className="entity-body"
                    x="-32"
                    y="-32"
                    width="64"
                    height="64"
                    rx="12"
                    onPointerEnter={(event) => setPlacementHover(event, "entity", node.id)}
                    onPointerLeave={() => setHoveredPlacement((value) => value?.target === "entity" && value.id === node.id ? null : value)}
                  />
                  {(() => {
                    const placement = nodeLabelPlacements.get(node.id)!;
                    const descriptionLines = node.description.trim()
                      ? wrapNodeLabel(truncateNodeText(node.description, 28), 20)
                      : [];
                    const offsetX = placement.x - position.x;
                    const offsetY = placement.y - position.y;
                    const labelDistance = Math.max(1, Math.hypot(offsetX, offsetY));
                    const directionX = offsetX / labelDistance;
                    const directionY = offsetY / labelDistance;
                    const boundaryDistance = Math.min(
                      Math.abs(directionX) > .001 ? placement.width / 2 / Math.abs(directionX) : Infinity,
                      Math.abs(directionY) > .001 ? placement.height / 2 / Math.abs(directionY) : Infinity,
                    );
                    return <g
                      className="node-label-group"
                      data-entity-id={node.id}
                       onContextMenuCapture={(event) => openObjectContextFromPointer("node-label", node.id, event)}
                       onContextMenu={(event) => openObjectContextFromPointer("node-label", node.id, event)}
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
                      <rect
                        className="label-drag-hit"
                        x={offsetX - placement.width / 2}
                        y={offsetY - placement.height / 2}
                        width={placement.width}
                        height={placement.height}
                        rx="3"
                        onContextMenu={(event) => openObjectContextFromPointer("node-label", node.id, event)}
                        onPointerEnter={(event) => setPlacementHover(event, "node-label", node.id)}
                        onPointerLeave={() => setHoveredPlacement((value) => value?.target === "node-label" && value.id === node.id ? null : value)}
                      />
                      <text className="node-label" textAnchor="middle" x={offsetX} y={offsetY + (descriptionLines.length === 0 ? 4 : descriptionLines.length === 1 ? -3 : -15)}>{truncateNodeText(node.label, 22)}</text>
                      {descriptionLines.map((line, index) => (
                        <text key={`description-${index}`} className="node-description" textAnchor="middle" x={offsetX} y={offsetY + (descriptionLines.length === 1 ? 12 : index * 15)}>{line}</text>
                      ))}
                    </g>;
                  })()}
                </g>
              ); })}
            </g>
          </svg>
          {graph.eventRelatedHiddenEdges > 0 && <p>{formatUnsupportedEventRelations(locale, graph.eventRelatedHiddenEdges)}</p>}
          {!contextMenu && hoveredPlacement && !(hoveredPlacement.target === "entity" && relationCreationPreview?.sourceId === hoveredPlacement.id) && (
            <div
              ref={popoverRef}
              className="placement-hover-popover"
              role="status"
              style={popoverPosition ?? preferredPopoverPosition(hoveredPlacement)}
            >
              {(() => {
                const node = graph.nodes.find(({ id }) => id === hoveredPlacement.id);
                const edge = routedEdges.find(({ id }) => id === hoveredPlacement.id);
                const relation = dataset?.relations.find(({ id }) => id === hoveredPlacement.id);
                const source = edge ? graph.nodes.find(({ id }) => id === edge.sourceId) : undefined;
                const target = edge ? graph.nodes.find(({ id }) => id === edge.targetId) : undefined;
                const kind = hoveredPlacement.target;
                const lines = composeHoverLines(kind, {
                  name: kind === "entity" ? node?.label : typeof relation?.name === "string" ? relation.name : undefined,
                  description: kind === "node-label" ? node?.description : undefined,
                  source: source?.label,
                  target: target?.label,
                  ownership: kind === "entity" ? "" : placementText(kind, hoveredPlacement.id),
                  self: kind === "relation-route" && relation?.sourceId === relation?.targetId,
                });
                return lines.map((line, index) => <div key={`${hoveredPlacement.id}-${index}`} className={kind === "entity" || index !== lines.length - 1 ? undefined : "placement-hover-popover__ownership"}>{line}</div>);
              })()}
            </div>
          )}
          {(selectedId || selectedRelationId) && <p role="status">{selectedId
            ? formatSelectedEntity(locale, selectedId)
            : formatSelectedRelation(locale, selectedRelationId!)}</p>}
          {selectedRelationDetail && !detailOpen && (
            <div className="graph-selection-actions">
              <p className="relation-curvature-hint" role="status">{translate(locale, "selectedRelationCurvatureHint")}</p>
              <button type="button" onClick={() => setDetailOpen(true)}>{translate(locale, "editRelation")}</button>
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
                {translate(locale, "automaticRoute")}
              </button>
              <button
                type="button"
                disabled={!manualRelationLabelAnchors.current.has(selectedRelationDetail.relation.id)}
                onClick={() => {
                  manualRelationLabelAnchors.current.delete(selectedRelationDetail.relation.id);
                  setEdgeLabelOffsets((value) => {
                    const updated = { ...value };
                    delete updated[selectedRelationDetail.relation.id];
                    return updated;
                  });
                  setManualLabelRevision((value) => value + 1);
                }}
              >
                {translate(locale, "automaticLabelPlacement")}
              </button>
            </div>
          )}
          {selectedDetail && !detailOpen && (
            <div className="graph-selection-actions">
              <button type="button" onClick={() => setDetailOpen(true)}>{translate(locale, "editEntity")}</button>
            </div>
          )}
          {dataset && coordinateMigrationReadiness && !coordinateMigrationReadiness.ready && coordinateMigrationReadiness.code !== "linkscape_coordinate_draft_migration_no_source" && coordinateMigrationReadiness.code !== "linkscape_coordinate_draft_migration_target_exists" && (
            <p className="status-message" role="status">
              {translate(locale, "coordinateDraftMigrationRefusal")}
          </p>
          )}
          {selectedRelationDetail && <p role="status">{translate(locale, "relationRoutePlacement")}: {placementText("relation-route", selectedRelationDetail.relation.id)} · {translate(locale, "relationLabelPlacement")}: {placementText("relation-label", selectedRelationDetail.relation.id)}</p>}
          {selectedId && <p role="status">{translate(locale, "nodeLabelPlacement")}: {placementText("node-label", selectedId)}</p>}
          {coordinatesDirty && <p className="selection-message" role="status">{translate(locale, "movedCoordinatesTemporaryDetail")}</p>}
          {detailOpen && selectedDetail && (
            <EntityDetailDialog
              locale={locale}
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
              locale={locale}
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
      <footer className="app-footer workspace-footer">
        <small>{translate(locale, "footerDescriptor")}</small>
        <button type="button" className="credits-button" onClick={(event) => { creditsTriggerRef.current = event.currentTarget; setCreditsOpen(true); }}>{translate(locale, "credits")}</button>
      </footer>
      {creditsOpen && <CreditsDialog locale={locale} onClose={() => setCreditsOpen(false)} />}
    </div>
  );
}
