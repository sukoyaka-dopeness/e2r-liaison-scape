import type { ReactNode } from "react";
export function EntityDetailDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <><button className="detail-backdrop" type="button" aria-label="Close Entity Detail" onClick={onClose} /><aside className="detail" role="dialog" aria-modal="true" aria-labelledby="entity-detail-title">{children}</aside></>;
}
