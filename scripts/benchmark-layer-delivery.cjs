// Read-only HTTP benchmark. Run after build, with the normal database/table environment.
// A separate worker keeps server memory and SQL counts distinct from the 50 clients.
const { fork } = require('node:child_process');
const { createHash } = require('node:crypto');
const http = require('node:http');
const { createGzip, createGunzip } = require('node:zlib');
const { once } = require('node:events');

const layers = ['emopain', 'envpain', 'physpain', 'socioecopain'];
const clientFlag = process.argv.indexOf('--clients');
const concurrency = clientFlag < 0 ? 50 : Number(process.argv[clientFlag + 1]);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) throw Error('Use 1 to 200 clients');
const startup = process.argv.includes('--startup');

if (process.argv[2] === 'worker') {
  const { Pool } = require('pg');
  const originalQuery = Pool.prototype.query;
  let queries = 0;
  const peaks = { rss: 0, heapUsed: 0, external: 0 };
  const sample = () => {
    const current = process.memoryUsage();
    for (const key of Object.keys(peaks)) peaks[key] = Math.max(peaks[key], current[key]);
    return current;
  };
  Pool.prototype.query = function (query, ...args) {
    const sql = typeof query === 'string' ? query : query.text;
    if (!/^\s*SELECT\b/i.test(sql)) throw Error('Benchmark refuses non-SELECT SQL');
    queries++;
    return originalQuery.call(this, query, ...args);
  };
  const { app } = require('../dist/src/app.js');
  const server = app.listen(0, '127.0.0.1', () => {
    sample();
    process.send({ ready: server.address().port, memory: sample() });
  });
  const sampling = setInterval(sample, 10);
  process.on('message', (message) => {
    if (message === 'stats') process.send({ queries, memory: sample(), peaks,
      maxRssBytes: process.resourceUsage().maxRSS * 1024 });
    if (message === 'stop') {
      clearInterval(sampling);
      server.close(() => process.exit(0));
      server.closeAllConnections();
    }
  });
} else {
  const encoding = process.argv.includes('--gzip') ? 'gzip' : 'identity';
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency * (startup ? 4 : 1) });
  let worker;
  async function get(port, layer, measureCompression) {
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port, path: '/init/' + layer, agent,
        headers: { 'Accept-Encoding': encoding } }, (response) => {
        let wireBytes = 0, decodedBytes = 0, gzipBytes = 0;
        const hash = createHash('sha256');
        const compressed = measureCompression ? createGzip() : null;
        const decoded = response.headers['content-encoding'] === 'gzip' ? createGunzip() : response;
        if (decoded !== response) response.pipe(decoded);
        const done = compressed ? once(compressed, 'end') : Promise.resolve();
        compressed?.on('data', (chunk) => { gzipBytes += chunk.length; });
        compressed?.on('error', reject);
        response.on('data', (chunk) => { wireBytes += chunk.length; });
        response.on('error', reject);
        decoded.on('error', reject);
        decoded.on('data', (chunk) => {
          decodedBytes += chunk.length;
          if (decodedBytes > 32 * 1024 ** 2) {
            request.destroy(Error('Layer body exceeds benchmark 32 MiB bound'));
            return;
          }
          hash.update(chunk);
          compressed?.write(chunk);
        });
        decoded.on('end', async () => {
          const elapsedMs = performance.now() - started;
          compressed?.end();
          try {
            await done;
            resolve({ status: response.statusCode, elapsedMs, wireBytes, decodedBytes,
              hash: hash.digest('hex'), gzipBytes: compressed ? gzipBytes : null,
              encoding: response.headers['content-encoding'] ?? 'identity' });
          } catch (error) { reject(error); }
        });
      });
      request.setTimeout(60_000, () => request.destroy(Error('Layer request timed out')));
      request.on('error', reject);
    });
  }
  async function stats() {
    const reply = once(worker, 'message');
    worker.send('stats');
    return (await reply)[0];
  }
  async function run() {
    worker = fork(__filename, ['worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const [ready] = await once(worker, 'message');
    if (!ready.ready) throw Error('Worker did not provide a port');
    const rows = [];
    let before = await stats();
    for (const layer of layers) {
      let expected;
      for (const pass of ['cold', 'warm']) {
        const results = await Promise.all(Array.from({ length: concurrency }, (_, i) =>
          get(ready.ready, layer, pass === 'cold' && i === 0 && encoding === 'identity')));
        expected ??= results[0].hash;
        const after = await stats();
        const times = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
        rows.push({ layer, pass, clients: concurrency,
          errors: results.filter((r) => r.status !== 200).length,
          mismatches: results.filter((r) => r.hash !== expected).length,
          medianMs: Number(times[Math.floor((times.length - 1) * .5)].toFixed(2)),
          p95Ms: Number(times[Math.floor((times.length - 1) * .95)].toFixed(2)),
          wireBytes: results.reduce((sum, r) => sum + r.wireBytes, 0),
          bodyBytes: results[0].decodedBytes, bodyHash: expected,
          gzipSampleBytes: results[0].gzipBytes, encoding: results[0].encoding,
          queries: after.queries - before.queries, memory: after.memory, peaks: after.peaks,
          maxRssBytes: after.maxRssBytes });
        before = after;
      }
    }
    if (startup) {
      // Every client requests all four layers together, matching the initial all-pain view.
      for (const pass of ['startup-warm', 'startup-repeat']) {
        const began = performance.now();
        const hashes = new Map(rows.map(row => [row.layer, row.bodyHash]));
        const results = await Promise.all(Array.from({length:concurrency}, async () => {
          const start = performance.now();
          const responses = await Promise.all(layers.map(async layer => ({layer,...await get(ready.ready,layer,false)})));
          return {elapsedMs:performance.now()-start, responses};
        }));
        const all = results.flatMap(result => result.responses);
        const times = results.map(result=>result.elapsedMs).sort((a,b)=>a-b);
        const after = await stats();
        rows.push({layer:'all-layers',pass,clients:concurrency,requests:all.length,
          errors:all.filter(r=>r.status!==200).length,
          mismatches:all.filter(r=>r.hash!==hashes.get(r.layer)).length,
          medianMs:Number(times[Math.floor((times.length-1)*.5)].toFixed(2)),
          p95Ms:Number(times[Math.floor((times.length-1)*.95)].toFixed(2)),
          wallMs:Number((performance.now()-began).toFixed(2)),
          wireBytes:all.reduce((sum,r)=>sum+r.wireBytes,0),queries:after.queries-before.queries,
          memory:after.memory,peaks:after.peaks,maxRssBytes:after.maxRssBytes});
        before=after;
      }
    }
    const passed = rows.every((r) => r.errors === 0 && r.mismatches === 0);
    console.log(JSON.stringify({ passed, encoding, concurrency, initialMemory: ready.memory, rows }, null, 2));
    if (!passed) process.exitCode = 1;
  }
  run().catch((error) => { console.error(error.stack); process.exitCode = 1; }).finally(() => {
    agent.destroy();
    if (worker?.connected) worker.send('stop');
  });
}
