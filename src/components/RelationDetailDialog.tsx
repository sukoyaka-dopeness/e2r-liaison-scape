import type { ReactNode } from "react";
export function RelationDetailDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <><button className="detail-backdrop" type="button" aria-label="Close Relation Detail" onClick={onClose} /><aside className="detail" role="dialog" aria-modal="true" aria-labelledby="relation-detail-title">{children}</aside></>;
}
