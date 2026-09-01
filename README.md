# Pain Server

Last Updated: 2026-09-01
Version: 0.1.0

The PPP Map's backend server, including the frontend served to users.

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

`POST /survey` forwards the five survey answer fields to the private `pain-message` service:

- `wordBubbles`
- `wordBody`
- `temporality`
- `relations`
- `painDescription`

`userId` and `consent` are not forwarded. The response uses the message service's coordinate and
body-only paragraph:

```json
{
  "lat": 12.5,
  "lng": -47.25,
  "text": "Ice cracks beside the iron rail."
}
```

When consent is true, this same coordinate is offered to the existing local persistence path.
Downstream request errors remain `400` or `413`; an unavailable service, invalid response, or
downstream server error returns `502` with `Failed to generate survey message.`

Set the service URL with:

```text
PAIN_MESSAGE_URL=http://pain-message:7246
```

The Compose stack supplies this value over its private network. Direct host survey support requires
temporarily publishing the message container on `17246` and setting the URL for that command:

```bash
PAIN_MESSAGE_URL=http://127.0.0.1:17246 npm run dev
```

Without that explicit setup, use the integrated Compose server for survey testing.

Message selection is controlled by two constants near the top of `src/app.ts`:

```ts
const PAIN_MESSAGE_MAX_SENTENCES = 3;
const PAIN_MESSAGE_CHOSEN_BY = "priority";
```

`priority` is the fixed bank-priority selector and does not use embeddings. Change these constants
when the installation needs a different sentence count or selection method.

#### /metrics/toggle
...
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
