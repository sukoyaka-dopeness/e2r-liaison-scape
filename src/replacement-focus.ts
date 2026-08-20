export type ReplacementFocusTrigger = { isConnected: boolean; disabled: boolean };

export function canRestoreReplacementTrigger(trigger: ReplacementFocusTrigger | null): boolean {
  return trigger !== null && trigger.isConnected && !trigger.disabled;
}
