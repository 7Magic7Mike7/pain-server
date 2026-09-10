/*
 * File attribution
 * created by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { once } from 'node:events';
const logs = vi.hoisted(() => ({ apiinfo: vi.fn(), apierror: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../src/config/log-config', () => ({ LOGGER: { ...logs, child: () => logs } }));
vi.mock('../src/loader/db-loader', () => ({ storeInteractionBatch: vi.fn(), storeToggleMetric: vi.fn(),
  storeVisModeMetric: vi.fn(), storeUserCoordinate: vi.fn(), getPainLayer: vi.fn(), registerUser: vi.fn() }));
vi.mock('../src/coordinate-computer', () => ({ computeCoordinate: vi.fn() }));
import { app } from '../src/app';
import { storeInteractionBatch, storeToggleMetric, storeVisModeMetric, registerUser } from '../src/loader/db-loader';
import { computeCoordinate } from '../src/coordinate-computer';
import { parseInteractionBatch } from '../src/validation/interaction-events';
import { ServerConfig } from '../src/config/server-config';
const batch = () => ({ userId: 'abcdefghijklmnop', tabId: 'fe8134f0-8f3d-4d75-ae8e-02df94f318ed',
  consent: false, events: [{ seq: 0, type: 'country', target: 'country', action: 'open', country: 'GRL' }] });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(storeInteractionBatch).mockResolvedValue(1);
  vi.mocked(storeToggleMetric).mockResolvedValue(true);
  vi.mocked(storeVisModeMetric).mockResolvedValue(true);
});

describe('privacy-safe interaction batches', () => {
  it('admits 200 distinct proxied clients within the security branch limits', async () => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      for (const route of ['/init', '/metrics/events']) {
        let entered = 0;
        let release!: () => void;
        let allEntered!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; });
        const ready = new Promise<void>(resolve => { allEntered = resolve; });
        const work = async () => { if (++entered === 200) allEntered(); await held; };
        vi.mocked(registerUser).mockImplementation(async () => { await work(); return batch().userId; });
        vi.mocked(storeInteractionBatch).mockImplementation(async () => { await work(); return 1; });
        const requests = Array.from({length:200}, (_, index) => route === '/init' ?
          request(server).get(route).set('X-Forwarded-For', `192.0.2.${index+1}`).then(response => response) :
          request(server).post(route).set('X-Forwarded-For', `192.0.2.${index+1}`).send(batch()).then(response => response));
        let timer: ReturnType<typeof setTimeout>;
        try {
          await Promise.race([ready, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Only ${entered}/200 requests entered ${route}`)), 3000);
          })]);
        } finally { clearTimeout(timer!); release(); }
        const responses = await Promise.all(requests);
        expect(entered).toBe(200);
        expect(responses.every(response => response.status === 200)).toBe(true);
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('rejects malformed surveys before work and prevents HEAD registration', async () => {
    await request(app).head('/init').expect(405);
    expect(registerUser).not.toHaveBeenCalled();
    for (const body of [{}, {wordBubbles:'private'}, {wordBody:[{lat:Infinity,lng:0,word:'pain'}]}]) {
      await request(app).post('/survey').send(body).expect(400, {message:'Invalid survey input.'});
    }
    expect(computeCoordinate).not.toHaveBeenCalled();
    const development = ServerConfig.DEV_MODE;
    Object.defineProperty(ServerConfig, 'DEV_MODE', {value:false, configurable:true});
    try { await request(app).get('/db/1').expect(410); }
    finally { Object.defineProperty(ServerConfig, 'DEV_MODE', {value:development, configurable:true}); }
    await request(app).get('/init/__proto__').expect(404);
  });
  it('accepts a bounded batch and reports deduplicated storage count', async () => {
    await request(app).post('/metrics/events').send(batch()).expect(200, { accepted: 1 });
    vi.mocked(storeInteractionBatch).mockResolvedValue(0);
    await request(app).post('/metrics/events').send(batch()).expect(200, { accepted: 0 });
    expect(storeInteractionBatch).toHaveBeenCalledTimes(2);
  });
  it('retains click occurrence time separately from receipt time, and accepts older clients', () => {
    const b = batch();
    expect(parseInteractionBatch(b)).not.toBeNull();
    const atMs = Date.parse('2026-09-11T12:00:00Z');
    expect(parseInteractionBatch({...b, events: [{...b.events[0], atMs}]})?.events[0].atMs).toBe(atMs);
    for (const value of [-1, NaN, Infinity, '2026-09-11', 4102444800001]) {
      expect(parseInteractionBatch({...b, events: [{...b.events[0], atMs: value}]})).toBeNull();
    }
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
    const secret = 'private survey canary';
    vi.mocked(storeInteractionBatch).mockRejectedValueOnce(new Error(secret));
    const analytics = await request(app).post('/metrics/events').send(batch()).expect(503);
    expect(analytics.text).not.toContain(secret);
    vi.mocked(computeCoordinate).mockRejectedValueOnce(new Error(secret));
    const survey = await request(app).post('/survey').send({ painDescription: secret,
      userId:batch().userId, consent:false, wordBubbles:['grief'], wordBody:[{word:'grief',lat:0,lng:0}],
      temporality:['days'], relations:['my community'] }).expect(500);
    expect(computeCoordinate).toHaveBeenCalled();
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
  it('does not acknowledge a false result from the upstream metric storage contract', async () => {
    vi.mocked(storeToggleMetric).mockResolvedValueOnce(false);
    await request(app).post('/metrics/toggle').send({userId:batch().userId,kind:'layer',element:'emopain',enabled:true}).expect(500);
    vi.mocked(storeVisModeMetric).mockResolvedValueOnce(false);
    await request(app).post('/metrics/vizmode').send({userId:batch().userId,mode:'points'}).expect(503);
  });
});
