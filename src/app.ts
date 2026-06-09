import express from 'express';
import { getAllLayerInfo, LayerInfo, validateLayers } from './config/layer-config';
import { LOGGER } from './config/log-config';
import { ServerConfig } from './config/server-config';
import { getRowById, getPainLayer } from './loader/db-loader';
import { parsePainOrigin } from './validation/input-validator';


// ######################################################################################
export const app = express();


// ######################################################################################
//        Logging
// ######################################################################################

const logger = LOGGER.child({ service: "API" });
/**
 * Uses logger.apiinfo() to log information about API calls.
 * 
 * @param verb HTTP action (e.g., GET, POST)
 * @param apipath the called API path
 */
function apilog(verb: string, apipath: string): void {
  logger.apiinfo(`received ${verb} request for ${apipath}`);
}

/**
 * Uses logger.apierror() to log the passed error.
 * 
 * @param apipath the called API path
 * @param err the error to log
 */
function apierror(apipath: string, err: unknown): void {
  logger.apierror({ err }, `${apipath} failed`);
}


// ######################################################################################
//        Data initialization
// ######################################################################################

function initLayers(): Record<string, LayerInfo> {
  logger.info("Loading layer information...");
  const layerInfo = getAllLayerInfo();

  logger.info(`Validating information of ${layerInfo.length} layers...`);
  validateLayers(layerInfo);

  const recLayers: Record<string, LayerInfo> = {};
  for (const li of layerInfo) {
    // only add layer if we are in DEV_MODE or can correctly parse the layer
    const ppo = parsePainOrigin(li.id);
    if (ServerConfig.DEV_MODE || ppo != null && ppo.length > 0) {
      recLayers[li.id] = li;
      logger.info(`- added layer with id = ${li.id}`);
    }
    else {
      logger.warn(`Failed to parse pain origin for layer=${li.id}`);
    }
  }
  logger.info("Successfully loaded and validated layers.");
  return recLayers;
}
const layerInfo: Record<string, LayerInfo> = initLayers();


// ######################################################################################
//        Debug Endpoints
// ######################################################################################
app.get('/random', (req, res) => {
  apilog("GET", "/random");
  res.json({
    id: 1,
    lat: (Math.random() - 0.5) * Math.PI, // latitude
    lng: (Math.random() - 0.5) * 2 * Math.PI, // longitude
    value: Math.random(), // pain_value
    datatype: ["fire", "water", "depression", "neck", "teeth"][Math.floor(Math.random() * 5)], // pain_type
    painorigin: ["emo", "env"][Math.floor(Math.random() * 2)]
  });
});

app.get('/db/:id', async (req, res) => {
  const { id } = req.params;
  const apipath = `/db/${id}`;
  apilog("GET", apipath);
  try {
    const row = await getRowById(Number.parseInt(id, 10));
    res.json(row);
  }
  catch (error) {
    apierror(apipath, error);
    res.status(500).json({ error: 'Failed to fetch row with ' + error });
  }
});

// ######################################################################################
//        Frontend Initialization Endpoints
// ######################################################################################

// send information about layer structure
app.get('/init', async (req, res) => {
  apilog("GET", "/init");
  res.json(Object.values(layerInfo));
});

// send all data points for a layer
app.get('/init/:layer', async (req, res) => {
  const { layer } = req.params;
  const apipath =  `/init/${layer}`;
  apilog("GET", apipath);
  if (layer in layerInfo) {
    try {
      const data = await getPainLayer(layer, layerInfo);
      logger.apiinfo(`Responding with ${data.length} data points for ${apipath}`);
      res.json(data);
    }
    catch (error) {
      apierror(apipath, error);
      res.status(500).json({ error: 'Failed to fetch pain layer with ' + error });
    }
  }
  else {
    const errmsg = `${layer} is not among the known layers!`;
    apierror(apipath, new Error(errmsg));
    res.status(500).json({ error: errmsg});
  }
});

// SPA fallback: serve index.html for non-API routes
//app.use((req, res, next) => {
//  if (req.path.startsWith('/api')) return next();
//  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});
