import { useState } from "react";
import type { Dataset } from "../models";
import { formatEntityDeletionRefusal, formatEntityIncidentWarning, formatPresentationWriteRefusal, formatRelationDeletionRefusal, formatRelationUpdateRefusal, type Locale } from "../i18n";
import { assessEntityDeletion, deleteEntity, getEntityDetail, updateEntityDetails } from "../services/EntityService";
import { assessRelationDeletion, deleteRelation, getRelationDetail, updateRelation } from "../services/RelationService";
import { readRelationArrowDisplay, readRelationLineStyle, removeRelationPresentationRecord, writeRelationArrowDisplay, writeRelationLineStyle, type RelationArrowDisplay, type RelationLineStyle } from "../presentation-extension";

type DetailKind = "entity" | "relation";
type EntityDeletionResolutionFocusRequest = { relationId: string | null; requestId: number };

type DetailDeletionWorkflowOptions = {
  dataset: Dataset | null;
  locale: Locale;
  selectedId: string | null;
  selectedRelationId: string | null;
  onDatasetUpdate: (dataset: Dataset) => void;
  onMessage: (message: string) => void;
  onSelectEntity: (id: string | null) => void;
  onSelectRelation: (id: string | null) => void;
  onEntityDeleted: (id: string) => void;
  onRelationDeleted: (id: string) => void;
};

export function useDetailDeletionWorkflow({
  dataset,
  locale,
  selectedId,
  selectedRelationId,
  onDatasetUpdate,
  onMessage,
  onSelectEntity,
  onSelectRelation,
  onEntityDeleted,
  onRelationDeleted,
}: DetailDeletionWorkflowOptions) {
  const [entityNameDraft, setEntityNameDraft] = useState("");
  const [entityDescriptionDraft, setEntityDescriptionDraft] = useState("");
  const [relationNameDraft, setRelationNameDraft] = useState("");
  const [relationDescriptionDraft, setRelationDescriptionDraft] = useState("");
  const [relationSourceDraft, setRelationSourceDraft] = useState("");
  const [relationTargetDraft, setRelationTargetDraft] = useState("");
  const [relationArrowDisplayDraft, setRelationArrowDisplayDraft] = useState<RelationArrowDisplay>("normal");
  const [relationArrowDisplayTouched, setRelationArrowDisplayTouched] = useState(false);
  const [relationLineStyleDraft, setRelationLineStyleDraft] = useState<RelationLineStyle>("solid");
  const [relationLineStyleTouched, setRelationLineStyleTouched] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDismissal, setDetailDismissal] = useState<DetailKind | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DetailKind | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [entityDeletionResolutionId, setEntityDeletionResolutionId] = useState<string | null>(null);
  const [entityDeletionResolutionFocusRequest, setEntityDeletionResolutionFocusRequest] = useState<EntityDeletionResolutionFocusRequest>({ relationId: null, requestId: 0 });

  const selectedDetail = dataset && selectedId ? getEntityDetail(dataset, selectedId) : null;
  const selectedRelationDetail = dataset && selectedRelationId ? getRelationDetail(dataset, selectedRelationId) : null;
  const entityDeletionResolution = dataset && entityDeletionResolutionId
    ? {
      entity: dataset.entities.find(({ id }) => id === entityDeletionResolutionId) ?? null,
      relations: dataset.relations.filter(({ sourceId, targetId }) => sourceId === entityDeletionResolutionId || targetId === entityDeletionResolutionId),
    }
    : null;
  const entityDraftObject = selectedDetail?.entity ?? entityDeletionResolution?.entity ?? null;

  const meaningfulEntityDetailDraft = (detailOpen || (entityDeletionResolution !== null && entityDeletionResolution.entity !== null)) && entityDraftObject !== null && (
    entityNameDraft !== (typeof entityDraftObject.name === "string" ? entityDraftObject.name : "")
    || entityDescriptionDraft !== (typeof entityDraftObject.description === "string" ? entityDraftObject.description : "")
  );
  const arrowDisplayWriteResult = relationArrowDisplayTouched && dataset && selectedRelationId
    ? writeRelationArrowDisplay(dataset, selectedRelationId, relationArrowDisplayDraft)
    : null;
  const meaningfulArrowDisplayDraft = arrowDisplayWriteResult !== null && (
    "refusal" in arrowDisplayWriteResult || arrowDisplayWriteResult.changed
  );
  const lineStyleWriteResult = relationLineStyleTouched && dataset && selectedRelationId
    ? writeRelationLineStyle(dataset, selectedRelationId, relationLineStyleDraft)
    : null;
  const meaningfulLineStyleDraft = lineStyleWriteResult !== null && (
    "refusal" in lineStyleWriteResult || lineStyleWriteResult.changed
  );
  const meaningfulRelationDetailDraft = detailOpen && selectedRelationDetail !== null && (
    relationNameDraft !== (typeof selectedRelationDetail.relation.name === "string" ? selectedRelationDetail.relation.name : "")
    || relationDescriptionDraft !== (typeof selectedRelationDetail.relation.description === "string" ? selectedRelationDetail.relation.description : "")
    || relationSourceDraft !== selectedRelationDetail.sourceId
    || relationTargetDraft !== selectedRelationDetail.targetId
    || meaningfulArrowDisplayDraft
    || meaningfulLineStyleDraft
  );

  function closeDetail() {
    setDetailOpen(false);
  }

  function cancelDetailDismissal() {
    setDetailDismissal(null);
  }

  function discardDetailDraft() {
    const returnToResolution = detailDismissal === "relation" && entityDeletionResolutionId !== null;
    if (dataset && selectedRelationId) setRelationArrowDisplayDraft(readRelationArrowDisplay(dataset, selectedRelationId));
    setRelationArrowDisplayTouched(false);
    if (dataset && selectedRelationId) setRelationLineStyleDraft(readRelationLineStyle(dataset, selectedRelationId));
    setRelationLineStyleTouched(false);
    setDetailDismissal(null);
    setDetailOpen(false);
    if (returnToResolution) returnToEntityDeletionResolution();
  }

  function returnToEntityDeletionResolution() {
    if (!entityDeletionResolutionId) return;
    setDetailOpen(false);
    onSelectRelation(null);
    onSelectEntity(entityDeletionResolutionId);
  }

  function requestDetailDismissal() {
    const kind = selectedDetail ? "entity" : selectedRelationDetail ? "relation" : null;
    if (!kind) { setDetailOpen(false); return; }
    const dirty = kind === "entity"
      ? entityNameDraft !== (typeof selectedDetail?.entity.name === "string" ? selectedDetail.entity.name : "")
        || entityDescriptionDraft !== (typeof selectedDetail?.entity.description === "string" ? selectedDetail.entity.description : "")
      : meaningfulRelationDetailDraft;
    if (dirty) setDetailDismissal(kind);
    else if (kind === "relation" && entityDeletionResolutionId !== null) returnToEntityDeletionResolution();
    else setDetailOpen(false);
  }

  function saveRelationDetails() {
    if (!dataset || !selectedRelationId) return;
    const current = getRelationDetail(dataset, selectedRelationId);
    if (!current) { onMessage(formatRelationUpdateRefusal(locale, "relation_not_found")); return; }
    const result = updateRelation(dataset, selectedRelationId, {
      sourceId: relationSourceDraft,
      targetId: relationTargetDraft,
      name: relationNameDraft,
      description: relationDescriptionDraft,
    });
    if ("refusal" in result) { onMessage(formatRelationUpdateRefusal(locale, result.refusal)); return; }
    let finalDataset = result.dataset;
    if (relationArrowDisplayTouched) {
      const presentationResult = writeRelationArrowDisplay(finalDataset, selectedRelationId, relationArrowDisplayDraft);
      if ("refusal" in presentationResult) {
        onMessage(formatPresentationWriteRefusal(locale, presentationResult.refusal));
        return;
      }
      finalDataset = presentationResult.dataset;
    }
    if (relationLineStyleTouched) {
      const presentationResult = writeRelationLineStyle(finalDataset, selectedRelationId, relationLineStyleDraft);
      if ("refusal" in presentationResult) {
        onMessage(formatPresentationWriteRefusal(locale, presentationResult.refusal));
        return;
      }
      finalDataset = presentationResult.dataset;
    }
    if (finalDataset !== dataset) onDatasetUpdate(finalDataset);
    setRelationArrowDisplayDraft(readRelationArrowDisplay(finalDataset, selectedRelationId));
    setRelationArrowDisplayTouched(false);
    setRelationLineStyleDraft(readRelationLineStyle(finalDataset, selectedRelationId));
    setRelationLineStyleTouched(false);
    if (entityDeletionResolutionId !== null) returnToEntityDeletionResolution();
    else setDetailOpen(false);
    onMessage("");
  }

  function removeSelectedRelation() {
    if (!dataset || !selectedRelationId) return;
    const assessment = assessRelationDeletion(dataset, selectedRelationId);
    if (!assessment.ready) { onMessage(formatRelationDeletionRefusal(locale, assessment.reason)); return; }
    setDeleteConfirmationId(selectedRelationId);
    setDetailOpen(false);
    setDeleteConfirmation("relation");
  }

  function removeSelectedEntity() {
    const entityId = selectedId ?? selectedDetail?.entity.id;
    if (!dataset || !entityId) return;
    const assessment = assessEntityDeletion(dataset, entityId);
    if (!assessment.ready) {
      onMessage(assessment.incidentRelationCount ? formatEntityIncidentWarning(locale, assessment.incidentRelationCount) : formatEntityDeletionRefusal(locale, assessment.reason));
      if (assessment.incidentRelationCount) {
        setEntityDeletionResolutionId(entityId);
        setDetailOpen(false);
      }
      return;
    }
    setDeleteConfirmationId(entityId);
    if (!selectedId) onSelectEntity(entityId);
    setDetailOpen(false);
    setDeleteConfirmation("entity");
  }

  function cancelDeletion() {
    if (entityDeletionResolutionId !== null) {
      setEntityDeletionResolutionFocusRequest(({ requestId }) => ({
        relationId: deleteConfirmation === "relation" ? selectedRelationId : null,
        requestId: requestId + 1,
      }));
    }
    setDeleteConfirmation(null);
    if (entityDeletionResolutionId !== null && selectedRelationId !== null) returnToEntityDeletionResolution();
  }

  function confirmDeletion() {
    if (!dataset || !deleteConfirmation || !deleteConfirmationId) return;
    if (deleteConfirmation === "relation") {
      const result = deleteRelation(dataset, deleteConfirmationId);
      if (!result.deleted) { onMessage(formatRelationDeletionRefusal(locale, result.reason)); setDeleteConfirmation(null); if (entityDeletionResolutionId !== null) returnToEntityDeletionResolution(); return; }
      const presentationResult = removeRelationPresentationRecord(result.dataset, result.deletedId);
      if ("refusal" in presentationResult) { onMessage(formatPresentationWriteRefusal(locale, presentationResult.refusal)); setDeleteConfirmation(null); return; }
      onRelationDeleted(result.deletedId);
      onDatasetUpdate(presentationResult.dataset);
      setDeleteConfirmation(null);
      if (entityDeletionResolutionId !== null) returnToEntityDeletionResolution();
      else { onSelectRelation(null); setDetailOpen(false); }
      onMessage("");
      return;
    }
    if (deleteConfirmation === "entity") {
      const result = deleteEntity(dataset, deleteConfirmationId);
      if (!result.deleted) { onMessage(formatEntityDeletionRefusal(locale, result.reason)); setDeleteConfirmation(null); return; }
      onEntityDeleted(result.deletedId);
      onDatasetUpdate(result.dataset);
      onSelectEntity(null);
      setEntityDeletionResolutionId(null);
      setDetailOpen(false);
      setDeleteConfirmation(null);
      onMessage("");
    }
  }

  function saveEntityDetails() {
    if (!dataset || !selectedId) return;
    onDatasetUpdate(updateEntityDetails(dataset, selectedId, {
      name: entityNameDraft,
      description: entityDescriptionDraft,
    }));
    setDetailOpen(false);
    onMessage("");
  }

  function openRelatedRelation(relationId: string) {
    if (!dataset) return;
    const relation = dataset.relations.find(({ id }) => id === relationId);
    if (!relation) return;
    onSelectRelation(relationId);
    onSelectEntity(null);
    initializeRelationDetail(relation, dataset);
  }

  function inspectBlockingRelation(relationId: string) {
    if (!entityDeletionResolutionId) return;
    if (!dataset) return;
    const relation = dataset.relations.find(({ id }) => id === relationId);
    if (!relation) return;
    onSelectRelation(relationId);
    onSelectEntity(null);
    initializeRelationDetail(relation, dataset);
  }

  function cancelEntityDeletionResolution() {
    const entityId = entityDeletionResolutionId;
    if (!entityId) return;
    setEntityDeletionResolutionId(null);
    onSelectRelation(null);
    onSelectEntity(entityId);
    setDetailOpen(true);
  }

  function openEntityDetail(entityId: string) {
    const entity = dataset?.entities.find(({ id }) => id === entityId);
    if (!entity) return;
    onSelectEntity(entityId);
    onSelectRelation(null);
    setEntityNameDraft(typeof entity.name === "string" ? entity.name : "");
    setEntityDescriptionDraft(typeof entity.description === "string" ? entity.description : "");
    setDetailOpen(true);
  }

  function openRelationDetail(relationId: string) {
    if (!dataset) return;
    const relation = dataset.relations.find(({ id }) => id === relationId);
    if (!relation) return;
    onSelectRelation(relationId);
    onSelectEntity(null);
    initializeRelationDetail(relation, dataset);
  }

  function initializeRelationDetail(relation: Dataset["relations"][number], sourceDataset: Dataset) {
    setRelationNameDraft(typeof relation.name === "string" ? relation.name : "");
    setRelationDescriptionDraft(typeof relation.description === "string" ? relation.description : "");
    setRelationSourceDraft(typeof relation.sourceId === "string" ? relation.sourceId : "");
    setRelationTargetDraft(typeof relation.targetId === "string" ? relation.targetId : "");
    setRelationArrowDisplayDraft(readRelationArrowDisplay(sourceDataset, relation.id));
    setRelationArrowDisplayTouched(false);
    setRelationLineStyleDraft(readRelationLineStyle(sourceDataset, relation.id));
    setRelationLineStyleTouched(false);
    setDetailOpen(true);
  }

  return {
    selectedDetail,
    selectedRelationDetail,
    entityNameDraft,
    setEntityNameDraft,
    entityDescriptionDraft,
    setEntityDescriptionDraft,
    relationNameDraft,
    setRelationNameDraft,
    relationDescriptionDraft,
    setRelationDescriptionDraft,
    relationSourceDraft,
    setRelationSourceDraft,
    relationTargetDraft,
    setRelationTargetDraft,
    relationArrowDisplayDraft,
    changeRelationArrowDisplay: (mode: RelationArrowDisplay) => {
      setRelationArrowDisplayDraft(mode);
      setRelationArrowDisplayTouched(true);
    },
    relationLineStyleDraft,
    changeRelationLineStyle: (style: RelationLineStyle) => {
      setRelationLineStyleDraft(style);
      setRelationLineStyleTouched(true);
    },
    detailOpen,
    detailDismissal,
    deleteConfirmation,
    entityDeletionResolution,
    entityDeletionResolutionFocusRequest,
    meaningfulEntityDetailDraft,
    meaningfulRelationDetailDraft,
    closeDetail,
    cancelDetailDismissal,
    discardDetailDraft,
    requestDetailDismissal,
    saveEntityDetails,
    saveRelationDetails,
    removeSelectedEntity,
    removeSelectedRelation,
    cancelDeletion,
    confirmDeletion,
    openEntityDetail,
    openRelationDetail,
    openRelatedRelation,
    inspectBlockingRelation,
    cancelEntityDeletionResolution,
  };
}
