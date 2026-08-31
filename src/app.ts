import express from 'express';
import { getAllLayerInfo, LayerInfo, validateLayers } from './config/layer-config';
import { LOGGER } from './config/log-config';
import { ApiConfig, ServerConfig } from './config/server-config';
import { getRowById, getPainLayer, registerUser, storeToggleMetric, storeStepMetric, storeVisModeMetric, storeUserCoordinate } from './loader/db-loader';
import { parsePainOrigin } from './validation/input-validator';
import { PainDbConfig } from './config/db-config';
import { computeCoordinate, Coordinate } from './coordinate-computer';


// ######################################################################################
export const app = express();
app.use(express.json());


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
    if (ServerConfig.DEV_MODE || ppo != null) {
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
    const row = await getRowById(Number.parseInt(id, 10), PainDbConfig.TN_ENV);
    res.json(row);
  }
  catch (error) {
    apierror(apipath, error);
    res.status(500).json({ message: 'Failed to fetch row.', error });
  }
});

// ######################################################################################
//        Frontend Initialization Endpoints
// ######################################################################################

// send information about layer structure
app.get('/init', async (req, res) => {
  apilog("GET", "/init");
  try {
    const userId = await registerUser();
    res.json({ userId, layerInfo: Object.values(layerInfo) });
  }
  catch (error) {
    apierror("/init", error);
    res.status(500).json({ message: "Error while registering user.", error });
  }
});

// send all (fully aggregated) data points for a layer
app.get('/init/:layer', async (req, res) => {
  const { layer } = req.params;
  const apipath =  `/init/${layer}`;
  apilog("GET", apipath);
  if (layer in layerInfo) {
    try {
      const data = await getPainLayer(layer);
      logger.apiinfo(`Responding with ${data.length} data points for ${apipath}`);
      res.json(data);
    }
    catch (error) {
      apierror(apipath, error);
      res.status(500).json({ message: `Failed to fetch pain layer ${layer}`, error });
    }
  }
  else {
    const errmsg = `${layer} is not among the known layers!`;
    apierror(apipath, new Error(errmsg));
    res.status(500).json({ message: errmsg, error: new Error("Invalid layer!")});
  }
});


// ######################################################################################
//        User Survey Endpoints
// ######################################################################################

app.post(ApiConfig.SURVEY, async (req, res) => {
  apilog("POST", ApiConfig.SURVEY);
  logger.apiinfo(`req.body = ${JSON.stringify(req.body)}`);
  const { userId, consent, wordBubbles, wordBody, temporality, relations, painDescription } = req.body;
  logger.apiinfo(`  consent = ${JSON.stringify(consent)}`);
  logger.apiinfo(`  userId = ${JSON.stringify(userId)}`);
  logger.apiinfo(`  wordBubbles = ${JSON.stringify(wordBubbles)}`);
  logger.apiinfo(`  wordBody = ${JSON.stringify(wordBody)}`);
  logger.apiinfo(`  temporality = ${JSON.stringify(temporality)}`);
  logger.apiinfo(`  relations = ${JSON.stringify(relations)}`);
  logger.apiinfo(`  painDescription = ${JSON.stringify(painDescription)}`);

  let coordinate: Coordinate | undefined;
  let text: string | undefined;
  try {
    coordinate = await computeCoordinate(wordBubbles, wordBody, temporality, relations, painDescription);
  }
  catch (error) {
    apierror(ApiConfig.SURVEY, error);  // todo: should these really use apierror if they don't fail due to API reasons?
    res.status(500).json({ message: "Failed to compute coordinate from survey.", error });
    return;
  }
  try {
    // todo: optionally, generate a text from the information
    text = "TODO";
  }
  catch (error) {
    apierror(ApiConfig.SURVEY, error);  // todo: should these really use apierror if they don't fail due to API reasons?
    res.status(500).json({ message: "Failed to generate text from survey.", error });
    return;
  }
  if (coordinate && text) {
    try {
      // only store resulting coordinate if the user gave consent
      if (consent) {
        if (!await storeUserCoordinate(userId, coordinate)) {
          throw new Error("Failed to store computed coordinates!");
        }
      }
    }
    catch (error) {
      apierror(ApiConfig.SURVEY, error)
    }
    res.status(200).json({ lat: coordinate.lat, lng: coordinate.lng, text: "todo" });
  }
  else {
    apierror(ApiConfig.SURVEY, new Error(`Either no coordinate or text! coordinate=${coordinate}, text="${text}"`));
    res.status(500).json({ message: ``}); // todo
  }
});


// ######################################################################################
//        User Metrics Endpoints
// ######################################################################################

app.post(ApiConfig.METRICS_TOGGLE, async (req, res) => {
  apilog("POST", ApiConfig.METRICS_TOGGLE);
  const { userId, kind, element, enabled } = req.body;
  logger.apiinfo(`  userId = ${JSON.stringify(userId)}`);
  logger.apiinfo(`  kind = ${JSON.stringify(kind)}`);
  logger.apiinfo(`  element = ${JSON.stringify(element)}`);
  logger.apiinfo(`  enabled = ${JSON.stringify(enabled)}`);

  try {
    await storeToggleMetric(userId, kind, element, enabled);
    res.status(200).send();
  }
  catch (error) {
    apierror(ApiConfig.METRICS_TOGGLE, error);
    res.status(500).json({ message: `Failed to store toggle metrics for ${kind}/${element}.`, error });
  }
});

app.post(ApiConfig.METRICS_STEP, async (req, res) => {
  apilog("POST", ApiConfig.METRICS_TOGGLE);
  const { userId, step } = req.body;
  logger.apiinfo(`  userId = ${JSON.stringify(userId)}`);
  logger.apiinfo(`  step = ${JSON.stringify(step)}`);

  try {
    await storeStepMetric(userId,step);
    res.status(200).send();
  }
  catch (error) {
    apierror("Failed to store step metric", error);
    res.status(500).json({ message: "Failed to store step metric.", error });
  }
});

app.post(ApiConfig.METRICS_VIZMODE, async (req, res) => {
  apilog("POST", ApiConfig.METRICS_TOGGLE);
  const { userId, mode } = req.body;
  logger.apiinfo(`  userId = ${JSON.stringify(userId)}`);
  logger.apiinfo(`  mode = ${JSON.stringify(mode)}`);

  try {
    await storeVisModeMetric(userId, mode);
    res.status(200).send();
  }
  catch (error) {
    apierror("Failed to store viz mode metric", error);
    res.status(500).json({ message: "Failed to store viz mode metric.", error });
  }
});

// SPA fallback: serve index.html for non-API routes
//app.use((req, res, next) => {
//  if (req.path.startsWith('/api')) return next();
//  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});
