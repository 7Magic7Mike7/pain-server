import { getPainLayer } from './db-loader';

type LayerResponse = { body: Buffer; count: number };
const lifetimeMs = 5 * 60_000;
// Keys come only from the finite validated layer registry in app.ts.
const responses = new Map<string, { expires: number; pending: Promise<LayerResponse> }>();

/** Share a successful serialized response, including concurrent requests for an uncached layer. */
export function getLayerResponse(layer: string): Promise<LayerResponse> {
  const existing = responses.get(layer);
  if (existing && existing.expires > Date.now()) return existing.pending;
  const pending: Promise<LayerResponse> = getPainLayer(layer).then((rows) => {
    const response = { body: Buffer.from(JSON.stringify(rows)), count: rows.length };
    entry.expires = Date.now() + lifetimeMs;
    return response;
  }).catch((error: unknown) => {
    if (responses.get(layer) === entry) responses.delete(layer);
    throw error;
  });
  const entry = { expires: Infinity, pending };
  responses.set(layer, entry);
  return entry.pending;
}
