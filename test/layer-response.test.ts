import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/loader/db-loader', () => ({ getPainLayer: vi.fn() }));
import { getPainLayer } from '../src/loader/db-loader';
import { app } from '../src/app';

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
    const responses = await Promise.all(Array.from({ length: 50 }, () => request(app).get('/init/emopain')));
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
});
