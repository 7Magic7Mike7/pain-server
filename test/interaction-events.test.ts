import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
const logs = vi.hoisted(() => ({ apiinfo: vi.fn(), apierror: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('../src/config/log-config', () => ({ LOGGER: { ...logs, child: () => logs } }));
vi.mock('../src/loader/db-loader', () => ({ storeInteractionBatch: vi.fn(), storeToggleMetric: vi.fn(),
  storeVisModeMetric: vi.fn(), storeUserCoordinate: vi.fn(), getPainLayer: vi.fn() }));
vi.mock('../src/coordinate-computer', () => ({ computeCoordinate: vi.fn() }));
import { app } from '../src/app';
import { storeInteractionBatch, storeToggleMetric, storeVisModeMetric } from '../src/loader/db-loader';
import { computeCoordinate } from '../src/coordinate-computer';
import { parseInteractionBatch } from '../src/validation/interaction-events';
const batch = () => ({ userId: 'abcdefghijklmnop', tabId: 'fe8134f0-8f3d-4d75-ae8e-02df94f318ed',
  consent: false, events: [{ seq: 0, type: 'country', target: 'country', action: 'open', country: 'GRL' }] });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(storeInteractionBatch).mockResolvedValue(1); });

describe('privacy-safe interaction batches', () => {
  it('accepts a bounded batch and reports deduplicated storage count', async () => {
    await request(app).post('/metrics/events').send(batch()).expect(200, { accepted: 1 });
    vi.mocked(storeInteractionBatch).mockResolvedValue(0);
    await request(app).post('/metrics/events').send(batch()).expect(200, { accepted: 0 });
    expect(storeInteractionBatch).toHaveBeenCalledTimes(2);
  });
  it('rejects unknown fields, arbitrary text, invalid enums, sizes and numbers before SQL', async () => {
    const b = batch(), e = b.events[0];
    const invalid = [ { ...b, secret: 'canary' }, { ...b, userId: 'unknown' },
      { ...b, events: [] }, { ...b, events: Array(33).fill(e) },
      ...[{ text: 'canary' }, { country: 'Greenland' }, { emotion: 'canary' }, { target: 'canary' },
        { action: 'canary' }, { seq: -1 }, { durationMs: Infinity }, { count: 10001 },
        { enabled: 'yes' }, { characters: 8 }, { step: 1 }, { selectedCount: 1 }, { hasText: true }]
        .map(change => ({ ...b, events: [{ ...e, ...change }] })),
      { ...b, events: [e, e] } ];
    for (const value of invalid) {
      expect(parseInteractionBatch(value)).toBeNull();
      await request(app).post('/metrics/events').send(value).expect(400);
    }
    await request(app).post('/metrics/events').send({ ...b, padding: 'x'.repeat(17000) }).expect(413);
    const malformed = await request(app).post('/metrics/events').set('Content-Type', 'application/json')
      .send('{"PRIVATE_CANARY":').expect(400);
    expect(malformed.text).not.toContain('PRIVATE_CANARY');
    expect(storeInteractionBatch).not.toHaveBeenCalled();
  });
  it('requires explicit consent for all survey/detail contexts', async () => {
    for (const [type, target] of [['survey', 'survey-text'], ['window', 'survey'], ['window', 'result']]) {
      const b = { ...batch(), events: [{ seq: 0, type, target, action: 'close', characters: 18,
        hasText: true, count: 3, selectedCount: 2, step: 5, durationMs: 1250 }] };
      await request(app).post('/metrics/events').send(b).expect(400);
      await request(app).post('/metrics/events').send({ ...b, consent: true }).expect(200);
      await request(app).post('/metrics/events').send({ ...b, consent: true,
        events: [{ ...b.events[0], emotion: '05_grief' }] }).expect(400);
    }
  });
  it('never echoes storage errors or raw survey content, including error paths', async () => {
    const secret = 'RAW_SURVEY_CANARY_π';
    vi.mocked(storeInteractionBatch).mockRejectedValueOnce(new Error(secret));
    const analytics = await request(app).post('/metrics/events').send(batch()).expect(503);
    expect(analytics.text).not.toContain(secret);
    vi.mocked(computeCoordinate).mockRejectedValueOnce(new Error(secret));
    const survey = await request(app).post('/survey').send({ painDescription: secret,
      wordBubbles: [secret], wordBody: [secret], temporality: [secret], relations: [secret] }).expect(500);
    expect(survey.text).not.toContain(secret);
    expect(JSON.stringify(Object.values(logs).map(log => log.mock.calls))).not.toContain(secret);
    expect(storeInteractionBatch).toHaveBeenCalledTimes(1);
  });
  it('does not send an unknown registration to storage as a successful batch', async () => {
    vi.mocked(storeInteractionBatch).mockResolvedValueOnce(null);
    await request(app).post('/metrics/events').send(batch()).expect(400, { message: 'Unknown session.' });
  });
  it('blocks legacy answer identities and strips country names before storage', async () => {
    for (const kind of ['word', 'relation', 'temporality']) {
      await request(app).post('/metrics/toggle').send({ userId: batch().userId, kind,
        element: 'RAW_SURVEY_CANARY', enabled: true }).expect(400);
    }
    await request(app).post('/metrics/surveystep').send({ userId: batch().userId, step: 1 }).expect(400);
    await request(app).post('/metrics/toggle').send({ userId: batch().userId, kind: 'category',
      element: 'GRL:Greenland', enabled: true }).expect(200);
    expect(storeToggleMetric).toHaveBeenCalledExactlyOnceWith(batch().userId, 'category', 'GRL', true);
  });
  it('preserves the setup schema visualization modes, separate from color theme', async () => {
    for (const mode of ['points', 'scars', 'multiplex-v0']) {
      await request(app).post('/metrics/vizmode').send({ userId: batch().userId, mode }).expect(200);
      expect(storeVisModeMetric).toHaveBeenLastCalledWith(batch().userId, mode);
    }
    for (const mode of ['light', 'dark', 'PRIVATE_CANARY']) {
      await request(app).post('/metrics/vizmode').send({ userId: batch().userId, mode }).expect(400);
    }
    expect(storeVisModeMetric).toHaveBeenCalledTimes(3);
  });
});
