# Read-only layer delivery

Last Updated: 2026-09-05
Version: 1.0

Only `GET /init/:layer` shares successful responses for five minutes. Concurrent misses share
one database read. Failures are removed immediately; registration, survey and metrics are not
cached. The finite validated layer registry bounds the cache. Refresh occurs on the first request
after expiry. Live database edits may therefore take up to five minutes to appear.

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
independent registration. The registration test previously expected the obsolete array response;
it now checks the actual userId/layerInfo contract using a test double, without creating users.

These are local delivery measurements, not public-network or deployment results.
