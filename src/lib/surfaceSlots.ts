const SLOT_RE = /\{\{(\w+)\}\}/g;

export type SlotData = Record<string, string | number>;

export function resolveSurfaceSlots(template: string, data: SlotData): string {
  return template.replace(SLOT_RE, (_, key) => {
    const val = data[key];
    if (val !== undefined && val !== null) return String(val);
    if (import.meta.env.DEV) {
      console.warn(`[surfaceSlots] Unfilled slot "{{${key}}}" — add it to slotData or remove from template.`);
    }
    return "";
  });
}
