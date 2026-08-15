type ConfirmationDialogProps = { subject: "Entity" | "Relation"; onCancel: () => void; onConfirm: () => void };
export function ConfirmationDialog({ subject, onCancel, onConfirm }: ConfirmationDialogProps) {
  return <><button className="detail-backdrop confirmation-backdrop" type="button" aria-label="Cancel deletion" onClick={onCancel} /><aside className={`detail confirmation confirmation-${subject.toLowerCase()}`} role="dialog" aria-modal="true" aria-label="Confirm deletion"><h3>Confirm deletion</h3><p>Delete this {subject}?</p><div className="detail-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="danger-confirm" onClick={onConfirm}>Delete</button></div></aside></>;
}
