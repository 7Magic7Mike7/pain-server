/** created by: Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach */
import { validUserId } from './interaction-events';

/** Validate before database/composer work. This examines input transiently and never logs it. */
export function validSurveyInput(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  if (Object.keys(b).some(k => !['userId', 'consent', 'wordBubbles', 'wordBody', 'temporality', 'relations', 'painDescription'].includes(k))) return false;
  if (b.consent !== undefined && typeof b.consent !== 'boolean') return false;
  if (b.consent === true && !validUserId(b.userId)) return false;
  const text = (v: unknown) => typeof v === 'string' && v.length <= 128;
  const list = (v: unknown) => Array.isArray(v) && v.length <= 64 && v.every(text);
  if (![b.wordBubbles, b.temporality, b.relations].every(list) ||
      typeof b.painDescription !== 'string' || b.painDescription.length > 10000) return false;
  return Array.isArray(b.wordBody) && b.wordBody.length <= 64 && b.wordBody.every(v =>
    v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).every(k => ['lat', 'lng', 'word'].includes(k)) && text(v.word) &&
    Number.isFinite(v.lat) && Math.abs(v.lat) <= 90 && Number.isFinite(v.lng) && Math.abs(v.lng) <= 180);
}
