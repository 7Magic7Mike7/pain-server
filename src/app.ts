// Copyright © 2026 Michael Artner
import express from 'express';
import { getAllLayerInfo, LayerInfo, validateLayers } from './config/layer-config';
import { LOGGER } from './config/log-config';
import { ApiConfig, ServerConfig } from './config/server-config';
import { getPainLayer, registerUser, storeToggleMetric, storeStepMetric, storeVisModeMetric, storeUserCoordinate } from './loader/db-loader';
import { parsePainOrigin, validateStepMetric, validateSurvey, validateToggleMetric, validateVisMetric } from './validation/input-validator';
import { computeCoordinate, Coordinate } from './coordinate-computer';
import { generateText } from './text-generation';
import { validateUserId } from './config/user-config';


// ######################################################################################
export const app = express();
app.use(express.json());

const USER_UNINITIALIZED = "uninitialized";

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
function apiinfo(verb: string, apipath: string): void {
  logger.apiinfo(`received ${verb} request for ${apipath}`);
}

/**
 * Uses logger.apierror() to log the passed error.
 * 
 * @param apipath the called API path
 * @param userId id of the user that called the API
 * @param err the error to log
 */
function apierror(apipath: string, userId: string, err: unknown, info?: string): void {
  if (info) {
    logger.apierror({ err }, `${apipath} failed for userId=\"${userId}\". INFO=${info}`);
  }
  else {
    logger.apierror({ err }, `${apipath} failed for userId=\"${userId}\"`);
  }
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
      logger.warn(`- FAILED to parse pain origin for layer=${li.id}`);
    }
  }
  logger.info("Successfully loaded and validated layers.");
  return recLayers;
}
const layerInfo: Record<string, LayerInfo> = initLayers();


// ######################################################################################
//        Debug Endpoints
// ######################################################################################
/**
 * OBSOLETE
 */
app.get('/random', (req, res) => {
  const apipath = `/random`;
  res.status(410).json({ message: `Outdated API called: \"${apipath}\" no longer exists!` });
});

/**
 * OBSOLETE
 */
app.get('/db/:id', async (req, res) => {
  const { id } = req.params;
  const apipath = `/db/${id}`;
  res.status(410).json({ message: `Outdated API called: \"${apipath}\" no longer exists!` });
});

// ######################################################################################
//        Frontend Initialization Endpoints
// ######################################################################################

// send information about layer structure
app.get(ApiConfig.INIT, async (req, res) => {
  apiinfo("GET", ApiConfig.INIT);
  try {
    const userId = await registerUser();
    res.json({ userId, layerInfo: Object.values(layerInfo) });
  }
  catch (error) {
    apierror(ApiConfig.INIT, USER_UNINITIALIZED, error);
    res.status(500).json({ message: "Error while registering user.", error });
  }
});

// send all (fully aggregated) data points for a layer
app.get(`${ApiConfig.INIT}/:layer`, async (req, res) => {
  const { layer } = req.params;
  const apipath =  `/init/${layer}`;
  apiinfo("GET", apipath);
  if (layer in layerInfo) {
    try {
      const data = await getPainLayer(layer);
      logger.debug(`Responding with ${data.length} data points for ${apipath}`);
      res.json(data);
    }
    catch (error) {
      apierror(apipath, USER_UNINITIALIZED, error);
      res.status(500).json({ message: `Failed to fetch data from layer=\"${layer}\"`, error });
    }
  }
  else {
    const errmsg = `${layer} is not among the known layers!`;
    apierror(apipath, USER_UNINITIALIZED, new Error(errmsg));
    res.status(500).json({ message: errmsg, error: new Error("Invalid layer!")});
  }
});


// ######################################################################################
//        User Survey Endpoints
// ######################################################################################

app.post(ApiConfig.SURVEY, async (req, res) => {
  apiinfo("POST", ApiConfig.SURVEY);
  const { userId, consent, wordBubbles, wordBody, temporality, relations, painDescription } = req.body;

  // validate user input
  if (!validateUserId(userId)) {
    const msg = `Received invalid userId=\"${userId}\"!`;
    logger.apierror(`For ${ApiConfig.METRICS_VIZMODE}: ${msg}`);
    res.status(400).json({ message: msg, lat: 0, lng: 0 }); // send dummy coordinate as fallback if client handles the response incorrectly
  }
  const valRes = validateSurvey(consent, wordBubbles, wordBody, temporality, relations, painDescription);
  if (!valRes.isValid) {
    const msg = `Received invalid toggle metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_TOGGLE}: ${msg} Reason = ${valRes.info}`);
    res.status(400).json({ message: msg });
  }

  // try to compute a coordinate from the user input
  let coordinate: Coordinate | undefined;
  try {
    coordinate = await computeCoordinate(wordBubbles, wordBody, temporality, relations, painDescription);
  }
  catch (error) {
    logger.error({ err: error }, `Error during computeCoordinate() for userId=\"${userId}\"`, `req.body = ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: "Failed to compute coordinate from survey.", error });
    return;
  }

  // try to generate text from the user input
  let text: string | undefined;
  try {
    text = generateText(painDescription);
  }
  catch (error) {
    logger.error({ err: error }, `Error during generateText() for userId=${userId}`, `req.body = ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: "Failed to generate text from survey.", error });
    return;
  }

  if (coordinate && text) {
    try {
      // only store resulting coordinate if the user gave consent
      if (consent) {
        if (!await storeUserCoordinate(userId, coordinate)) {
          logger.error(`Failed to store user coordinate for userId=${userId}.`);
        }
      }
    }
    catch (error) {
      apierror(ApiConfig.SURVEY, userId, error);
    }
    // we still send 200 so the user can receive their coordiante & text
    res.status(200).json({ lat: coordinate.lat, lng: coordinate.lng, text });
  }
  else {
    const errMsg = `Either no coordinate or text was computed! coordinate=${coordinate}, text="${text}"`;
    logger.error(`Failed to either compute a coordinate or text for userId=\"${userId}\"!
      coordinate=${coordinate}, text="${text}", req.body = ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: errMsg, error: new Error("Invalid coordinate or text computation!")});
  }
});


// ######################################################################################
//        User Metrics Endpoints
// ######################################################################################

app.post(ApiConfig.METRICS_TOGGLE, async (req, res) => {
  apiinfo("POST", ApiConfig.METRICS_TOGGLE);
  const { userId, kind, element, enabled } = req.body;

  // validate user input
  if (!validateUserId(userId)) {
    const msg = `Received invalid userId=\"${userId}\"!`;
    logger.apierror(`For ${ApiConfig.METRICS_TOGGLE}: ${msg}`);
    res.status(400).json({ message: msg });
  }
  const valRes = validateToggleMetric(kind, element, enabled);
  if (!valRes.isValid) {
    const msg = `Received invalid toggle metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_TOGGLE}: ${msg} Reason = ${valRes.info}`);
    res.status(400).json({ message: msg });
  }

  try {
    if (await storeToggleMetric(userId, kind, element, enabled)) {
      res.status(200).send();
    }
    else {
      logger.apierror(`Failed to store step metric. req.body = ${JSON.stringify(req.body)}`);
      res.status(500).json({ message: "Failed to store toggle metric.", error: new Error("Unknown Error")});
    }
  }
  catch (error) {
    apierror(ApiConfig.METRICS_TOGGLE, userId, error, `req.body = ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: "Failed to store toggle metric.", error });
  }
});

app.post(ApiConfig.METRICS_STEP, async (req, res) => {
  apiinfo("POST", ApiConfig.METRICS_STEP);
  const { userId, step } = req.body;

  // validate user input
  if (!validateUserId(userId)) {
    const msg = `Received invalid userId=\"${userId}\"!`;
    logger.apierror(`For ${ApiConfig.METRICS_STEP}: ${msg}`);
    res.status(400).json({ message: msg });
  }
  const valRes = validateStepMetric(step);
  if (!valRes.isValid) {
    const msg = `Received invalid step metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_STEP}: ${msg} Reason = ${valRes.info}`);
    res.status(400).json({ message: msg });
  }

  try {
    if (await storeStepMetric(userId, step)) {
      res.status(200).send();
    }
    else {
      logger.apierror(`Failed to store step metric. req.body = ${JSON.stringify(req.body)}`);
      res.status(500).json({ message: "Failed to store step metric.", error: new Error("Unknown Error")});
    }
  }
  catch (error) {
    apierror(ApiConfig.METRICS_STEP, userId, error, `req.body = ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: "Failed to store step metric.", error });
  }
});

app.post(ApiConfig.METRICS_VIZMODE, async (req, res) => {
  apiinfo("POST", ApiConfig.METRICS_VIZMODE);
  const { userId, mode } = req.body;

  // validate user input
  if (!validateUserId(userId)) {
    const msg = `Received invalid userId=\"${userId}\"!`;
    logger.apierror(`For ${ApiConfig.METRICS_VIZMODE}: ${msg}`);
    res.status(400).json({ message: msg });
  }
  const valRes = validateVisMetric(mode);
  if (!valRes.isValid) {
    const msg = `Received invalid vis metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_VIZMODE}: ${msg} Reason = ${valRes.info}`);
    res.status(400).json({ message: msg });
  }

  try {
    if (!await storeVisModeMetric(userId, mode)) {
      res.status(200).send();
    }
    else {
      logger.apierror(`Failed to store vis mode metric. req.body = ${JSON.stringify(req.body)}`);
      res.status(500).json({ message: "Failed to store vis mode metric.", error: new Error("Unknown Error")});
    }
  }
  catch (error) {
    apierror(ApiConfig.METRICS_VIZMODE, userId, error, `req.body = ${JSON.stringify(req.body)}`);
    res.status(500).json({ message: "Failed to store viz mode metric.", error });
  }
});
