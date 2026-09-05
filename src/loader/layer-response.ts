import { getPainLayer } from './db-loader';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

type LayerResponse = { body: Buffer; count: number; compressed?: Promise<Buffer> };
const compress = promisify(gzip);
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

/** Compress once per successful cache entry, with a retry if compression itself fails. */
export function getCompressedLayerResponse(response: LayerResponse): Promise<Buffer> {
  return response.compressed ??= compress(response.body).catch((error: unknown) => {
    response.compressed = undefined;
    throw error;
  });
}
