/** created by: Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach */
const TYPES = ['control', 'country', 'emotion', 'survey', 'window', 'gesture', 'page'];
const ACTIONS = ['click', 'open', 'close', 'change', 'enable', 'disable', 'next', 'back',
  'submit', 'start', 'end', 'visible', 'hidden', 'input'];
const TARGETS = ['layer', 'all-layers', 'theme', 'sound', 'about', 'sources', 'share', 'consent',
  'survey', 'survey-options', 'survey-text', 'survey-body', 'country', 'emotion', 'emotion-filter',
  'globe', 'page', 'festival', 'workshop', 'result', 'cycle', 'quality', 'menu', 'source-link',
  'about-link', 'globe-rotate', 'globe-zoom', 'operator', 'data-export', 'exit', 'update-settings'];
export const EMOTIONS = ['01_pain', '02_hurt', '03_eco_anxiety', '04_uncertainty', '05_grief',
  '06_anger', '07_hardship', '08_displacement', '09_trauma', '10_loneliness', '11_depression',
  '12_fear', '13_helplessness', '14_shame'];
export const LAYERS = ['emopain', 'envpain', 'physpain', 'socioecopain', 'all-layers'];
const KEYS = ['seq', 'type', 'target', 'action', 'country', 'emotion', 'enabled', 'layer', 'step',
  'count', 'selectedCount', 'hasText', 'characters', 'durationMs', 'atMs'];

export type InteractionEvent = {
  seq: number; type: string; target: string; action: string; atMs?: number;
  country?: string; emotion?: string; enabled?: boolean; layer?: string; step?: number;
  count?: number; selectedCount?: number; hasText?: boolean; characters?: number; durationMs?: number;
};
export type InteractionBatch = {
  userId: string; tabId: string; consent: boolean; events: InteractionEvent[];
};
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, max: number) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
export const validUserId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{16}$/.test(v);

/** Reject extra properties before persistence: analytics never accepts arbitrary text. */
export function parseInteractionBatch(value: unknown): InteractionBatch | null {
  if (!object(value) || Object.keys(value).some(k => !['userId', 'tabId', 'consent', 'events'].includes(k)) ||
      !validUserId(value.userId) || typeof value.tabId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.tabId) ||
      typeof value.consent !== 'boolean' || !Array.isArray(value.events) ||
      value.events.length < 1 || value.events.length > 32 ||
      Buffer.byteLength(JSON.stringify(value)) > 16384) return null;
  const seen = new Set<number>();
  for (const e of value.events) {
    if (!object(e) || Object.keys(e).some(k => !KEYS.includes(k)) ||
        !integer(e.seq, Number.MAX_SAFE_INTEGER) || seen.has(e.seq as number) ||
        !TYPES.includes(e.type as string) || !TARGETS.includes(e.target as string) ||
        !ACTIONS.includes(e.action as string)) return null;
    seen.add(e.seq as number);
    if (e.country !== undefined && (typeof e.country !== 'string' || !/^[A-Z]{3}$/.test(e.country))) return null;
    if (e.emotion !== undefined && !EMOTIONS.includes(e.emotion as string)) return null;
    if (e.layer !== undefined && !LAYERS.includes(e.layer as string)) return null;
    for (const key of ['enabled', 'hasText']) if (e[key] !== undefined && typeof e[key] !== 'boolean') return null;
    for (const [key, max] of [['step', 5], ['count', 10000], ['selectedCount', 10000],
      ['characters', 100000], ['durationMs', 86400000], ['atMs', 4102444800000]] as const) {
      if (e[key] !== undefined && !integer(e[key], max)) return null;
    }
    const survey = e.type === 'survey' || String(e.target).startsWith('survey') || e.target === 'result';
    if (survey && (!value.consent || e.country !== undefined || e.emotion !== undefined || e.layer !== undefined)) return null;
    if (!survey && ['step', 'selectedCount', 'hasText', 'characters'].some(k => e[k] !== undefined)) return null;
  }
  return value as InteractionBatch;
}
