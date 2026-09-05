# Read-only layer delivery

Last Updated: 2026-09-06
Version: 1.2

Only `GET /init/:layer` shares successful responses for five minutes. Concurrent misses share
one database read. Failures are removed immediately; registration, survey and metrics are not
cached. The finite validated layer registry bounds the cache. Refresh occurs on the first request
after expiry. Live database edits may therefore take up to five minutes to appear.

An unresolved database read is shared for at most the same five-minute window. A later request
then starts a new read instead of remaining attached to the stalled promise forever. If the old
read eventually settles, it completes only its original callers and cannot replace the newer
entry. Failed reads are still removed immediately.

The cached value is the existing JSON response encoded once as UTF-8. A shared Buffer avoids
allocating a separate encoded body for each client. The first string-only trial improved latency
but raised peak RSS to 190 MB under concurrent physical-layer delivery; the Buffer trial uses
84 MB. Response bodies and database queries/schemas are unchanged.

## Verification

Run `npm run build`, `npm test`, then the benchmark with the usual database/table environment:

```sh
node scripts/benchmark-layer-delivery.cjs
```

The benchmark runs 50 HTTP clients against a separate application worker. It streams body hashes,
counts SQL calls, records worker memory, and rejects non-SELECT SQL. It does not call `/init`,
survey or metrics. Cold means first application-cache traversal, not a cold database page cache.
The four source payloads agree byte for byte before and after the optimization.

On the existing Docker Node 20 runtime and database, warm p95 milliseconds:

| Layer | Baseline | Cached Buffer | Queries per 50 cold/warm requests |
|---|---:|---:|---:|
| Emotional | 20.97 | 6.75 | 1 / 0 |
| Environmental | 570.70 | 30.06 | 1 / 0 |
| Physical | 897.07 | 49.53 | 1 / 0 |
| Socioeconomic | 12.78 | 3.78 | 1 / 0 |

Baseline query counts were 50 / 50. All 800 baseline/cached requests returned matching successful
bodies. The tests also cover 50 simultaneous misses, expiry, failed-read retry, separate keys and
independent registration, and retry after an unresolved read outlives its coalescing lease. The
registration test previously expected the obsolete array response;
it now checks the actual userId/layerInfo contract using a test double, without creating users.

Gzip is generated once on demand per cache entry through Node's asynchronous zlib API. The route
negotiates gzip/identity using Express, sets Vary: Accept-Encoding, and preserves decoded bytes.
Unsupported encodings produce 406. Compression failures are retryable and do not discard the
successful identity response. Registration, survey and metrics do not use this code.

Run the same benchmark with `--gzip` to include client decompression and measure wire bytes:

| Layer | Gzip body bytes | Wire reduction | Warm p95 including decompression (ms) |
|---|---:|---:|---:|
| Emotional | 2,471 | 86.9% | 7.47 |
| Environmental | 228,527 | 79.7% | 56.79 |
| Physical | 410,548 | 77.8% | 87.53 |
| Socioeconomic | 3,457 | 80.0% | 3.70 |

All 400 compressed requests match baseline decoded bodies. Compression uses more local CPU than
identity delivery but saves substantial transfer; warm latency still improves over the uncached
baseline. Peak worker RSS is 86.6 MB. No additional package is required. All 22 tests pass.
One earlier HTTP test run returned a single 400; it did not recur in a focused repeat, three full
suite repeats or the real 50-client benchmark. Its cause is unestablished; no application fix is
claimed for it. Assertions now include the response body if it returns again.

These are local delivery measurements, not public-network or deployment results.
