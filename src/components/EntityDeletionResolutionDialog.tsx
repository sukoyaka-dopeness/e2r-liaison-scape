import { useEffect, useRef } from "react";
import type { Dataset, E2RObject } from "../models";
import { formatEntityIncidentWarning, translate, type Locale } from "../i18n";
import { buildRelationBlockerDisplays } from "../related-relation-display";

type Props = {
  locale: Locale;
  dataset: Dataset;
  entity: E2RObject;
  relations: E2RObject[];
  onInspectRelation: (relationId: string) => void;
  onKeepEntity: () => void;
  onDeleteEntity: () => void;
  focusRequest: { relationId: string | null; requestId: number };
};

export function EntityDeletionResolutionDialog({ locale, dataset, entity, relations, onInspectRelation, onKeepEntity, onDeleteEntity, focusRequest }: Props) {
  const keepEntityRef = useRef<HTMLButtonElement>(null);
  const relationTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousRelationIds = useRef(relations.map(({ id }) => id));
  const displays = buildRelationBlockerDisplays(dataset, relations);
  const hasHiddenRelations = relations.some((relation) => displays.get(relation.id)?.hiddenFromGraph);
  const entityName = typeof entity.name === "string" && entity.name.trim() ? entity.name : entity.id;

  useEffect(() => {
    keepEntityRef.current?.focus();
  }, []);

  useEffect(() => {
    const currentIds = relations.map(({ id }) => id);
    const removedId = previousRelationIds.current.find((id) => !currentIds.includes(id));
    if (removedId) {
      const removedIndex = previousRelationIds.current.indexOf(removedId);
      const nextId = currentIds[removedIndex] ?? currentIds[removedIndex - 1];
      if (nextId) relationTriggerRefs.current.get(nextId)?.focus();
      else keepEntityRef.current?.focus();
    }
    previousRelationIds.current = currentIds;
  }, [relations]);

  useEffect(() => {
    if (focusRequest.requestId === 0) return;
    if (focusRequest.relationId) relationTriggerRefs.current.get(focusRequest.relationId)?.focus();
    else keepEntityRef.current?.focus();
  }, [focusRequest]);

  return <>
    <button className="detail-backdrop entity-deletion-resolution-backdrop" type="button" aria-label={translate(locale, "entityDeletionResolutionKeep")} onClick={onKeepEntity} />
    <aside className="detail entity-deletion-resolution" role="dialog" aria-modal="true" aria-labelledby="entity-deletion-resolution-title">
      <div className="detail-header">
        <h3 id="entity-deletion-resolution-title">{translate(locale, "entityDeletionResolutionTitle")}</h3>
      </div>
      <p className="entity-deletion-resolution__entity">{entityName}</p>
      {relations.length > 0 ? <>
        <p role="status">{formatEntityIncidentWarning(locale, relations.length)}</p>
        {hasHiddenRelations && <p>{translate(locale, "entityDeletionResolutionHidden")}</p>}
        <div className="entity-deletion-resolution__relations" aria-label={translate(locale, "entityDeletionResolutionConnections")}>
          {relations.map((relation) => {
            const display = displays.get(relation.id)!;
            return <article className="entity-deletion-resolution__relation" key={relation.id} data-relation-id={relation.id}>
              <div className="entity-deletion-resolution__identity">
                {display.relationName && <span className="related-relation-field"><span className="related-relation-label">{translate(locale, "name")}</span><span className="related-relation-value">{display.relationName}</span></span>}
                <span className="related-relation-field"><span className="related-relation-label">{translate(locale, "connectedObject")}</span><span className="related-relation-value">{display.source}</span></span>
                <span className="related-relation-field"><span className="related-relation-label">{translate(locale, "connectedObject")}</span><span className="related-relation-value">{display.target}</span></span>
                {display.relationIdHint && <span className="entity-deletion-resolution__id-hint">{display.relationIdHint}</span>}
              </div>
              <button
                ref={(element) => { if (element) relationTriggerRefs.current.set(relation.id, element); else relationTriggerRefs.current.delete(relation.id); }}
                type="button"
                onClick={() => onInspectRelation(relation.id)}
              >
                {translate(locale, "entityDeletionResolutionInspect")}
              </button>
            </article>;
          })}
        </div>
      </> : <p role="status">{translate(locale, "entityDeletionResolutionResolved")}</p>}
      <div className="detail-actions entity-deletion-resolution__actions">
        <button ref={keepEntityRef} type="button" onClick={onKeepEntity}>{translate(locale, "entityDeletionResolutionKeep")}</button>
        {relations.length === 0 && <button type="button" className="danger-action" onClick={onDeleteEntity}>{translate(locale, "entityDeleteAction")}</button>}
      </div>
    </aside>
  </>;
}
