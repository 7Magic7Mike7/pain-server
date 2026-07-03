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
  - lat: `number`
    - represents the datapoint's latitude
    - in [0, 180[
  - lng: `number`
    - represents the datapoint's longitude
    - in [0, 360[
  - value: `number`
    - represents the datapoint's pain value
    - in [0, 1]
  - datatype: `string`
    - represents the datapoint's category of pain data
  - painorigin: `string`
    - represents the datapoint's pain origin (i.e., layer)

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
