import { useState } from "react";
import type { Dataset } from "../models";
import { formatEntityDeletionRefusal, formatEntityIncidentWarning, formatRelationDeletionRefusal, formatRelationUpdateRefusal, type Locale } from "../i18n";
import { assessEntityDeletion, deleteEntity, getEntityDetail, updateEntityDetails } from "../services/EntityService";
import { assessRelationDeletion, deleteRelation, getRelationDetail, updateRelation } from "../services/RelationService";

type DetailKind = "entity" | "relation";

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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDismissal, setDetailDismissal] = useState<DetailKind | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DetailKind | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  const selectedDetail = dataset && selectedId ? getEntityDetail(dataset, selectedId) : null;
  const selectedRelationDetail = dataset && selectedRelationId ? getRelationDetail(dataset, selectedRelationId) : null;

  const meaningfulEntityDetailDraft = detailOpen && selectedDetail !== null && (
    entityNameDraft !== (typeof selectedDetail.entity.name === "string" ? selectedDetail.entity.name : "")
    || entityDescriptionDraft !== (typeof selectedDetail.entity.description === "string" ? selectedDetail.entity.description : "")
  );
  const meaningfulRelationDetailDraft = detailOpen && selectedRelationDetail !== null && (
    relationNameDraft !== (typeof selectedRelationDetail.relation.name === "string" ? selectedRelationDetail.relation.name : "")
    || relationDescriptionDraft !== (typeof selectedRelationDetail.relation.description === "string" ? selectedRelationDetail.relation.description : "")
    || relationSourceDraft !== selectedRelationDetail.sourceId
    || relationTargetDraft !== selectedRelationDetail.targetId
  );

  function closeDetail() {
    setDetailOpen(false);
  }

  function cancelDetailDismissal() {
    setDetailDismissal(null);
  }

  function discardDetailDraft() {
    setDetailDismissal(null);
    setDetailOpen(false);
  }

  function requestDetailDismissal() {
    const kind = selectedDetail ? "entity" : selectedRelationDetail ? "relation" : null;
    if (!kind) { setDetailOpen(false); return; }
    const dirty = kind === "entity"
      ? entityNameDraft !== (typeof selectedDetail?.entity.name === "string" ? selectedDetail.entity.name : "")
        || entityDescriptionDraft !== (typeof selectedDetail?.entity.description === "string" ? selectedDetail.entity.description : "")
      : relationNameDraft !== (typeof selectedRelationDetail?.relation.name === "string" ? selectedRelationDetail.relation.name : "")
        || relationDescriptionDraft !== (typeof selectedRelationDetail?.relation.description === "string" ? selectedRelationDetail.relation.description : "")
        || relationSourceDraft !== selectedRelationDetail?.sourceId
        || relationTargetDraft !== selectedRelationDetail?.targetId;
    if (dirty) setDetailDismissal(kind);
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
    onDatasetUpdate(result.dataset);
    setDetailOpen(false);
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
      return;
    }
    setDeleteConfirmationId(entityId);
    if (!selectedId) onSelectEntity(entityId);
    setDetailOpen(false);
    setDeleteConfirmation("entity");
  }

  function cancelDeletion() {
    setDeleteConfirmation(null);
  }

  function confirmDeletion() {
    if (!dataset || !deleteConfirmation || !deleteConfirmationId) return;
    if (deleteConfirmation === "relation") {
      const result = deleteRelation(dataset, deleteConfirmationId);
      if (!result.deleted) { onMessage(formatRelationDeletionRefusal(locale, result.reason)); setDeleteConfirmation(null); return; }
      onRelationDeleted(result.deletedId);
      onDatasetUpdate(result.dataset);
      onSelectRelation(null);
      setDetailOpen(false);
      setDeleteConfirmation(null);
      onMessage("");
      return;
    }
    if (deleteConfirmation === "entity") {
      const result = deleteEntity(dataset, deleteConfirmationId);
      if (!result.deleted) { onMessage(formatEntityDeletionRefusal(locale, result.reason)); setDeleteConfirmation(null); return; }
      onEntityDeleted(result.deletedId);
      onDatasetUpdate(result.dataset);
      onSelectEntity(null);
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
    setRelationNameDraft(typeof relation.name === "string" ? relation.name : "");
    setRelationDescriptionDraft(typeof relation.description === "string" ? relation.description : "");
    setRelationSourceDraft(typeof relation.sourceId === "string" ? relation.sourceId : "");
    setRelationTargetDraft(typeof relation.targetId === "string" ? relation.targetId : "");
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
    const relation = dataset?.relations.find(({ id }) => id === relationId);
    if (!relation) return;
    onSelectRelation(relationId);
    onSelectEntity(null);
    setRelationNameDraft(typeof relation.name === "string" ? relation.name : "");
    setRelationDescriptionDraft(typeof relation.description === "string" ? relation.description : "");
    setRelationSourceDraft(typeof relation.sourceId === "string" ? relation.sourceId : "");
    setRelationTargetDraft(typeof relation.targetId === "string" ? relation.targetId : "");
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
    detailOpen,
    detailDismissal,
    deleteConfirmation,
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
  };
}
