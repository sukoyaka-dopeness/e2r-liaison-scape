export const ACCEPTANCE_SAVED_PAYLOAD_KEY = "liaisonscape.acceptance.saved-dataset-payload";

export function storeAcceptancePayload(storage: Pick<Storage, "setItem">, raw: string): void {
  storage.setItem(ACCEPTANCE_SAVED_PAYLOAD_KEY, raw);
}

export function readAcceptancePayload(storage: Pick<Storage, "getItem">): string | null {
  return storage.getItem(ACCEPTANCE_SAVED_PAYLOAD_KEY);
}
