// Writes only to an explicitly designated, empty disposable database on loopback.
// Run after npm run build. Pass the additive setup migration as the sole argument.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { Pool } = require('pg');
const request = require('supertest');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
assert(process.env.DISPOSABLE_ANALYTICS_DB === '1' &&
  ['localhost', '127.0.0.1'].includes(url.hostname) && /^\/pain_analytics_test(?:_\d+)?$/.test(url.pathname),
  'Refusing writes outside an explicitly designated disposable pain_analytics_test database');
delete process.env.DEV;
process.env.LOG_LEVEL = 'silent';
const pools = new Set();
const originalQuery = Pool.prototype.query;
let batchQueries = 0;
Pool.prototype.query = function(sql, ...args) {
  pools.add(this);
  if (String(sql).includes('INSERT INTO interactionevents')) batchQueries++;
  return originalQuery.call(this, sql, ...args);
};
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const { app } = require('../dist/src/app');

(async () => {
  const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  assert.equal(existing.rowCount, 0, 'Refusing to reuse a nonempty test database');
  await db.query('CREATE TABLE users(id SERIAL PRIMARY KEY, userid TEXT NOT NULL UNIQUE)');
  await db.query(readFileSync(process.argv[2], 'utf8'));
  await db.query(readFileSync(process.argv[2], 'utf8')); // additive migration is repeat-safe
  const layers = ['emopain', 'envpain', 'physpain', 'socioecopain'];
  for (const layer of layers) {
    await db.query(`CREATE TABLE ${layer}(id integer, aggrid integer, value float, category text)`);
    await db.query(`INSERT INTO ${layer} SELECT i, NULL, i/1000.0, 'fixture' FROM generate_series(1,1000) i`);
  }
  const users = Array.from({length: 50}, (_, i) => String(i).padStart(16, 'A'));
  await db.query('INSERT INTO users(userid) SELECT unnest($1::text[])', [users]);
  const batches = users.map(userId => ({ userId, tabId: randomUUID(), consent: true,
    events: Array.from({length: 32}, (_, seq) => seq % 2 ?
      {seq, type: 'survey', target: 'survey-text', action: 'close', step: 5, characters: 17,
        hasText: true, selectedCount: 3, count: 4, durationMs: 5000} :
      {seq, type: 'country', target: 'country', action: 'open', country: 'GRL', emotion: '05_grief'}) }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const rows = [];
  try {
    for (const pass of ['first', 'retry', 'next', 'half']) {
      if (pass === 'next' || pass === 'half') for (const batch of batches) for (const e of batch.events) e.seq += 32;
      const active = pass === 'half' ? batches.slice(0,25) : batches;
      const before = batchQueries, times = [];
      const results = await Promise.all(active.map(async batch => {
        const t = performance.now();
        const result = await request(server).post('/metrics/events').send(batch);
        times.push(performance.now() - t);
        assert.equal(result.status, 200, result.text);
        assert.equal(result.body.accepted, pass === 'retry' ? 0 : 32);
        return result.body.accepted;
      }).concat(Array.from({length: active.length}, async (_, i) => {
        const response = await request(server).get('/init/' + layers[i % 4]);
        assert.equal(response.status, 200, response.text);
        assert.equal(response.body.length, 1000);
        return 0;
      })));
      times.sort((a,b) => a-b);
      rows.push({pass, clients: active.length * 2, batches: active.length, accepted: results.reduce((a,b)=>a+b,0),
        queries: batchQueries-before, medianMs: times[Math.floor(times.length/2)],
        p95Ms: times[Math.ceil(times.length*.95)-1], rss: process.memoryUsage().rss});
      assert.equal(batchQueries-before,active.length);
    }
    const count = await db.query('SELECT count(*)::integer AS count FROM interactionevents');
    assert.equal(count.rows[0].count, 4000);
    const duplicate = await db.query('SELECT tabid,seq FROM interactionevents GROUP BY tabid,seq HAVING count(*)>1');
    assert.equal(duplicate.rowCount,0);
    const invalid = await request(server).post('/metrics/events').send({ ...batches[0],
      events:[{seq:999,type:'control',target:'theme',action:'click',characters:9,text:'PRIVATE_CANARY'}] });
    assert.equal(invalid.status,400);
    assert(!invalid.text.includes('PRIVATE_CANARY'));
    console.log(JSON.stringify({passed:true, rows, events:count.rows[0].count}, null, 2));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack); process.exitCode=1; })
  .finally(() => Promise.all([...pools].map(pool => pool.end())));
