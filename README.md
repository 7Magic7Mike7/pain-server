<!--
File attribution
edited by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
-->
The PPP Map's backend server including the frontend that will be served to users.

# Backend
programmed using Node.js & Typescript

## APIs

### Prototyping

#### /random
returns a data point with random values

<code>
response = { <br>
id: number, <br>
lat: number in [0, 180[, <br>
lng: number in [0, 360[, <br>
value: number in [0, 1], <br>
datatype: string, <br>
painorigin: string <br>
}
</code>

### Initialization

#### /init
- returns information about all supported layers
  - see `type LayerInfo` in `/scripts/config/layer-config.ts`
- list of:
  - id: `string`
    - represents the layer's unique id for `/init/:layerId`
  - label: `string`
    - represents the layer's display name
  - desc: `string`
    - represents the layer's description
  - color: `string`
    - represents the layer's associated hex color
  - geospatial: `boolean`
    - whether the layer is based on geospatial coordinates or countries
  - text: `boolean`
    - whether the layer's datapoints have additional text information

#### /init/:layerId
- returns all datapoints of the requested layer
  - see `type PainData` in `/scripts/db-loader.ts`
- list of:
  - id: ascending `number`
    - represents a datapoint's unique (per pain origin) identifier
  - aggrId: `integer`
    - states the id of the datapoint that is an aggregation of this datapoint & others
    - undefined for fully aggregated points
  - value: `number`
    - represents the datapoint's pain value
    - in [0, 1]
  - category: `string`
    - represents the datapoint's category of pain data
  - lat: `number`
    - optional
    - represents the datapoint's latitude
    - in [0, 180[
  - lng: `number`
    - optional
    - represents the datapoint's longitude
    - in [0, 360[
  - country: `string`
    - optional
    - ISOA3 code of the country the datapoint is associate with
  - word: `string`
    - optional
    - a word or short phrase associated with the datapoint
### User Data
#### /survey
- /survey
#### /metrics/toggle
...

#### /metrics/events
Interaction analytics accepts at most 32 events and 16 KiB per JSON request. The body contains the
existing 16-character `userId`, a UUIDv4 `tabId`, a boolean `consent`, and `events`. Each event has a
monotonic safe-integer `seq` plus allowlisted `type`, `target`, and `action`. Optional fields and
their bounds are defined in `src/validation/interaction-events.ts`. Unknown properties are rejected.

`atMs` records device-reported event time in epoch milliseconds; ingestion stores it as
`occurred_at` separately from `received_at`. Older clients may omit it. Device clocks are not
trusted as server time. Apply the additive interaction migration before deploying this update.
The response is `{ accepted: number }`; retries of the same tab/sequence insert no duplicate rows.

The upstream `security` middleware runs first: 1,000 requests per 15 minutes per client address,
and a shared 10-request/minute limit on `/survey`, `/init` and its layer subpaths. It trusts one
reverse-proxy hop; deployment must match that topology. Visitors sharing an address share these
limits. Helmet and the 100 kB general JSON limit are retained; event batches have a tighter 16 kB
parser before the general parser.

The additional write guards then allow up to 600 registrations/surveys or 6,000 metrics requests
per minute, with at most 256 active requests and 4,096 address buckets. These guards do not raise
the earlier security limits and do not persist addresses. Excess work returns 429 or 503.

Earlier single-address 50/200-client throughput figures predate this security base. The existing
read-only benchmark can now intentionally hit HTTP 429. The mocked concurrency tests use distinct
forwarded client addresses and separately verify that the 11th sensitive request is rejected.

HEAD /init never registers a visitor. Survey shapes are validated before work, and requests to
the message service have a 15-second deadline. Database connection/query waits are bounded.
Debug routes are unavailable unless DEV=true or DEV=1; production images set DEV=false.
Public failures omit database internals. The runtime image uses Node 24 LTS, without Python
(owned by the separate message service) or test-only HTTP tooling.

Survey events require the explicit consent flag and contain only counts, text-presence and
character-count booleans/numbers, step and elapsed time. They cannot contain selected option names,
body placements, entered text, generated text, country or emotion. Public globe events can identify
a country by ISO3 and an emotion by its fixed category key. No request body, IP, user-agent, URL or
form text is persisted by this endpoint. The browser's consent declaration is required, not an
independent identity or consent attestation. Legacy survey toggle/step requests are rejected.

Apply the additive `pain-setup/migrations/20260909-interaction-events.sql` before enabling the
updated client. Do not re-run database initialization. Export only the explicit `interactionevents`
columns; older operational logs and legacy metrics may contain survey answers and are excluded.
Survey content is still processed transiently by the response service. Historical data is not
deleted by this change, and the separately hosted response service requires its own log audit.

Run `npx vitest run test/interaction-events.test.ts test/survey.test.ts test/layer-response.test.ts`
for database-independent validation and privacy checks. The write benchmark
`scripts/benchmark-interactions.cjs` requires an empty loopback database named
`pain_analytics_test` (or a numeric suffix), `DISPOSABLE_ANALYTICS_DB=1`, `DATABASE_URL`, and the
migration path as its argument. It exercises 50 and 100 mixed clients with synthetic layer data,
checks one SQL statement per batch, retry deduplication, and canary rejection. It does not claim
production-sized layer throughput; the existing read-only layer benchmark remains separate.

# Frontend
Serving the frontend developed in [this seperate repository](https://github.com/IsraViadest/pain-frontend)

# Node Commands

## Usage

### Build the project
```bash
npm run build
```
Compiled output is in the `dist/` folder.

### Start the server (production)
after building
```bash
npm run start
```
### Start the server (development)
includes build step
- for Linux
```bash
npm run dev
```
- for Windows
```bash
npm run dev-win
```
