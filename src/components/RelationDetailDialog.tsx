import type { E2RObject } from "../models";

type EndpointEditing = {
  entities: E2RObject[];
  sourceId: string;
  targetId: string;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
};

type RelationDetailDialogProps = {
  relation: E2RObject; sourceId: string; targetId: string; source: E2RObject | null; target: E2RObject | null;
  name: string; description: string; endpointEditing?: EndpointEditing;
  onNameChange: (value: string) => void; onDescriptionChange: (value: string) => void;
  onSave: () => void; onDelete: () => void; onClose: () => void;
};

export function RelationDetailDialog({ relation, sourceId, targetId, source, target, name, description, endpointEditing, onNameChange, onDescriptionChange, onSave, onDelete, onClose }: RelationDetailDialogProps) {
  const originalName = typeof relation.name === "string" ? relation.name : "";
  const originalDescription = typeof relation.description === "string" ? relation.description : "";
  const endpointLabel = (entity: E2RObject) => typeof entity.name === "string" ? entity.name : entity.id;
  const endpointsUnchanged = !endpointEditing || (endpointEditing.sourceId === sourceId && endpointEditing.targetId === targetId);
  const unchanged = name === originalName && description === originalDescription && endpointsUnchanged;
  return <><button className="detail-backdrop" type="button" aria-label="Close Relation Detail" onClick={onClose} /><aside className="detail" role="dialog" aria-modal="true" aria-labelledby="relation-detail-title"><div className="detail-header"><h3 id="relation-detail-title">Relation Detail</h3><button type="button" onClick={onClose}>Close</button></div>{endpointEditing ? <div className="detail-fields"><label htmlFor="relation-source">Source</label><select id="relation-source" value={endpointEditing.sourceId} onChange={(event) => endpointEditing.onSourceChange(event.target.value)}>{endpointEditing.entities.map((entity) => <option key={entity.id} value={entity.id}>{endpointLabel(entity)}</option>)}</select><label htmlFor="relation-target">Target</label><select id="relation-target" value={endpointEditing.targetId} onChange={(event) => endpointEditing.onTargetChange(event.target.value)}>{endpointEditing.entities.map((entity) => <option key={entity.id} value={entity.id}>{endpointLabel(entity)}</option>)}</select></div> : <dl><dt>Source</dt><dd>{typeof source?.name === "string" ? source.name : sourceId}</dd><dt>Target</dt><dd>{typeof target?.name === "string" ? target.name : targetId}</dd></dl>}<dl><dt>ID</dt><dd>{relation.id}</dd></dl><div className="detail-fields"><label htmlFor="relation-name">Name</label><input id="relation-name" type="text" value={name} onChange={(event) => onNameChange(event.target.value)} /><label htmlFor="relation-description">Description</label><textarea id="relation-description" rows={4} value={description} onChange={(event) => onDescriptionChange(event.target.value)} /></div><div className="detail-actions"><button type="button" disabled={unchanged} onClick={onSave}>Save Relation</button></div><div className="detail-danger"><span>Danger zone</span><button type="button" onClick={onDelete}>Delete Relation</button></div></aside></>;
}
