/*
 * File attribution
 * created by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { gunzipSync } from 'node:zlib';

vi.mock('../src/loader/db-loader', () => ({ getPainLayer: vi.fn() }));
import { getPainLayer } from '../src/loader/db-loader';
import { app } from '../src/app';
import { getLayerResponse, getCompressedLayerResponse } from '../src/loader/layer-response';

afterEach(() => vi.restoreAllMocks());

describe('read-only layer delivery', () => {
  it('coalesces 50 misses, preserves bytes, and refreshes after five minutes', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const rows = [{ id: 1, aggrId: 0, value: 0, category: 'grief', word: 'ألم' }];
    vi.mocked(getPainLayer).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return rows;
    });
    const responses = await Promise.all(Array.from({ length: 50 }, (_, index) =>
      request(app).get('/init/emopain').set('X-Forwarded-For', `198.51.100.${index+1}`)));
    for (const response of responses) {
      expect(response.status, response.text).toBe(200);
      expect(response.text).toBe(JSON.stringify(rows));
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    }
    expect(getPainLayer).toHaveBeenCalledTimes(1);
    now += 299_999;
    await request(app).get('/init/emopain').expect(200);
    expect(getPainLayer).toHaveBeenCalledTimes(1);
    now += 2;
    await request(app).get('/init/emopain').expect(200);
    expect(getPainLayer).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed load or confuse separate layer keys', async () => {
    vi.mocked(getPainLayer).mockReset().mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 2, aggrId: 0, value: 1, category: 'temperature' }]);
    await request(app).get('/init/physpain').expect(500);
    expect((await request(app).get('/init/physpain').expect(200)).body).toEqual([]);
    expect((await request(app).get('/init/envpain').expect(200)).body[0].id).toBe(2);
    expect(getPainLayer).toHaveBeenCalledTimes(3);
  });

  it('retries a load that remains unresolved beyond the cache lifetime', async () => {
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const stalled = new Promise<never>(() => {});
    const recovered = [{ id: 4, aggrId: 0, value: 0.5, category: 'temperature' }];
    vi.mocked(getPainLayer).mockReset().mockReturnValueOnce(stalled).mockResolvedValueOnce(recovered);

    const first = getLayerResponse('stalled-layer');
    expect(getLayerResponse('stalled-layer')).toBe(first);
    now += 5 * 60_000 + 1;
    const retry = getLayerResponse('stalled-layer');

    expect(retry).not.toBe(first);
    await expect(retry).resolves.toMatchObject({ count: 1 });
    expect(getPainLayer).toHaveBeenCalledTimes(2);
  });

  it('shares gzip work, negotiates quality values and preserves the decoded body', async () => {
    const rows = [{ id: 3, aggrId: 0, value: 0.25, category: 'socio' }];
    vi.mocked(getPainLayer).mockReset().mockResolvedValue(rows);
    const cached = await getLayerResponse('socioecopain');
    const first = getCompressedLayerResponse(cached);
    expect(getCompressedLayerResponse(cached)).toBe(first);
    expect(gunzipSync(await first).equals(cached.body)).toBe(true);
    for (const [accept, encoded] of [['gzip', true], ['gzip;q=0', false],
      ['gzip;q=0.5, identity;q=1', false], ['identity;q=0, gzip;q=1', true]] as const) {
      const response = await request(app).get('/init/socioecopain').set('Accept-Encoding', accept).expect(200);
      expect(response.text).toBe(JSON.stringify(rows));
      expect(response.headers['content-encoding']).toBe(encoded ? 'gzip' : undefined);
      expect(response.headers.vary).toBe('Accept-Encoding');
    }
    await request(app).get('/init/socioecopain').set('Accept-Encoding', 'gzip;q=0, identity;q=0').expect(406);
    expect(getPainLayer).toHaveBeenCalledTimes(1);
  });
});
