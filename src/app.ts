// Copyright © 2026 Michael Artner
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from "helmet";
import { getAllLayerInfo, LayerInfo, validateLayers } from './config/layer-config';
import { LOGGER } from './config/log-config';
import { ApiConfig, ServerConfig } from './config/server-config';
import { registerUser, storeToggleMetric, storeStepMetric, storeVisModeMetric, storeUserCoordinate } from './loader/db-loader';
import { parsePainOrigin, validateStepMetric, validateSurvey, validateToggleMetric, validateVisMetric } from './validation/input-validator';
import { getLayerResponse } from './loader/layer-response';
import { computeCoordinate, Coordinate } from './coordinate-computer';
import { validateUserId } from './config/user-config';


// ######################################################################################
export const app = express();
app.use(express.json({ limit: "100kb" }));  // 100 kb is the default

app.set("trust proxy", 1);

// general limit (including high-frequency metrics)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use(generalLimiter);

// limiter for computation heavier and non-regular APIs
const sensitiveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Try again later." },
});
app.use([ApiConfig.SURVEY, ApiConfig.INIT], sensitiveLimiter);

// helmet
app.disable("x-powered-by");
app.use(helmet());


// ######################################################################################

const USER_UNINITIALIZED = "uninitialized";

// ######################################################################################
//        Logging
// ######################################################################################

const logger = LOGGER.child({ service: "API" });
const PAIN_MESSAGE_URL = process.env.PAIN_MESSAGE_URL ?? "http://pain-message:7246";
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
  return res.status(410).json({ message: `Outdated API called: \"${apipath}\" no longer exists!` });
});

/**
 * OBSOLETE
 */
app.get('/db/:id', async (req, res) => {
  const { id } = req.params;
  const apipath = `/db/${id}`;
  return res.status(410).json({ message: `Outdated API called: \"${apipath}\" no longer exists!` });
});

// ######################################################################################
//        Frontend Initialization Endpoints
// ######################################################################################

// send information about layer structure
app.get(ApiConfig.INIT, async (req, res) => {
  apiinfo("GET", ApiConfig.INIT);
  try {
    const userId = await registerUser();
    return res.json({ userId, layerInfo: Object.values(layerInfo) });
  }
  catch (error) {
    apierror(ApiConfig.INIT, USER_UNINITIALIZED, error);
    return res.status(500).json({ message: "Error while registering user.", error: new Error("Error on init") });
  }
});

// send all (fully aggregated) data points for a layer
app.get(`${ApiConfig.INIT}/:layer`, async (req, res) => {
  const { layer } = req.params;
  const apipath =  `/init/${layer}`;
  apiinfo("GET", apipath);
  if (layer in layerInfo) {
    try {
      const data = await getLayerResponse(layer);
      logger.debug(`Responding with ${data.count} data points for ${apipath}`);
      res.set('Content-Type', 'application/json; charset=utf-8').send(data.body);
    }
    catch (error) {
      apierror(apipath, USER_UNINITIALIZED, error);
      return res.status(500).json({ message: `Failed to fetch data from layer=\"${layer}\"`, error: new Error("Invalid layer!") });
    }
  }
  else {
    const errmsg = `${layer} is not among the known layers!`;
    apierror(apipath, USER_UNINITIALIZED, new Error(errmsg));
    return res.status(500).json({ message: errmsg, error: new Error("Invalid layer!")});
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
    return res.status(400).json({ message: msg, lat: 0, lng: 0 }); // send dummy coordinate as fallback if client handles the response incorrectly
  }
  const valRes = validateSurvey(consent, wordBubbles, wordBody, temporality, relations, painDescription);
  if (!valRes.isValid) {
    const msg = `Received invalid toggle metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_TOGGLE}: ${msg} Reason = ${valRes.info}`);
    return res.status(400).json({ message: msg });
  }

  let coordinate: Coordinate | undefined;
  let text: string | undefined;
  try {
    coordinate = await computeCoordinate(wordBubbles, wordBody, temporality, relations, painDescription);
  }
  catch (error) {
    apierror(ApiConfig.SURVEY, userId, error);
    return res.status(500).json({ message: "Failed to compute coordinate from survey.", error: new Error("Error during coordinate computation.") });
  }
  try {
    const messageResponse = await fetch(`${PAIN_MESSAGE_URL}/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wordBubbles,
        wordBody,
        temporality,
        relations,
        painDescription,
      }),
    });

    if (!messageResponse.ok) {
      throw new Error(`pain-message returned ${messageResponse.status}`);
    }

    const message = await messageResponse.json() as { paragraph?: unknown };
    if (typeof message.paragraph !== "string" || !message.paragraph.trim()) {
      throw new Error("pain-message returned an invalid response");
    }

    text = message.paragraph;
  }
  catch (error) {
    apierror(ApiConfig.SURVEY, userId, error);
    return res.status(500).json({ message: "Failed to generate text from survey.", error: new Error("Error during text generation") });
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
    return res.status(200).json({ lat: coordinate.lat, lng: coordinate.lng, text });
  }
  else {
    apierror(ApiConfig.SURVEY, userId, new Error("Coordinate or message unavailable"));
    return res.status(500).json({ message: "Failed to complete survey." });
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
    return res.status(400).json({ message: msg });
  }
  const valRes = validateToggleMetric(kind, element, enabled);
  if (!valRes.isValid) {
    const msg = `Received invalid toggle metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_TOGGLE}: ${msg} Reason = ${valRes.info}`);
    return res.status(400).json({ message: msg });
  }

  try {
    if (await storeToggleMetric(userId, kind, element, enabled)) {
      return res.status(200).send();
    }
    else {
      logger.apierror(`Failed to store step metric. req.body = ${JSON.stringify(req.body)}`);
      return res.status(500).json({ message: "Failed to store toggle metric.", error: new Error("Unknown Error")});
    }
  }
  catch (error) {
    apierror(ApiConfig.METRICS_TOGGLE, userId, error, `req.body = ${JSON.stringify(req.body)}`);
    return res.status(500).json({ message: "Failed to store toggle metric.", error: new Error("Error for toggle metric") });
  }
});

app.post(ApiConfig.METRICS_STEP, async (req, res) => {
  apiinfo("POST", ApiConfig.METRICS_STEP);
  const { userId, step } = req.body;

  // validate user input
  if (!validateUserId(userId)) {
    const msg = `Received invalid userId=\"${userId}\"!`;
    logger.apierror(`For ${ApiConfig.METRICS_STEP}: ${msg}`);
    return res.status(400).json({ message: msg });
  }
  const valRes = validateStepMetric(step);
  if (!valRes.isValid) {
    const msg = `Received invalid step metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_STEP}: ${msg} Reason = ${valRes.info}`);
    return res.status(400).json({ message: msg });
  }

  try {
    if (await storeStepMetric(userId, step)) {
      return res.status(200).send();
    }
    else {
      logger.apierror(`Failed to store step metric. req.body = ${JSON.stringify(req.body)}`);
      return res.status(500).json({ message: "Failed to store step metric.", error: new Error("Unknown Error")});
    }
  }
  catch (error) {
    apierror(ApiConfig.METRICS_STEP, userId, error, `req.body = ${JSON.stringify(req.body)}`);
    return res.status(500).json({ message: "Failed to store step metric.", error: new Error("Error for step metric") });
  }
});

app.post(ApiConfig.METRICS_VIZMODE, async (req, res) => {
  apiinfo("POST", ApiConfig.METRICS_VIZMODE);
  const { userId, mode } = req.body;

  // validate user input
  if (!validateUserId(userId)) {
    const msg = `Received invalid userId=\"${userId}\"!`;
    logger.apierror(`For ${ApiConfig.METRICS_VIZMODE}: ${msg}`);
    return res.status(400).json({ message: msg });
  }
  const valRes = validateVisMetric(mode);
  if (!valRes.isValid) {
    const msg = `Received invalid vis metric input!`;
    logger.apierror(`For ${ApiConfig.METRICS_VIZMODE}: ${msg} Reason = ${valRes.info}`);
    return res.status(400).json({ message: msg });
  }

  try {
    if (!await storeVisModeMetric(userId, mode)) {
      return res.status(200).send();
    }
    else {
      logger.apierror(`Failed to store vis mode metric. req.body = ${JSON.stringify(req.body)}`);
      return res.status(500).json({ message: "Failed to store vis mode metric.", error: new Error("Unknown Error")});
    }
  }
  catch (error) {
    apierror(ApiConfig.METRICS_VIZMODE, userId, error, `req.body = ${JSON.stringify(req.body)}`);
    return res.status(500).json({ message: "Failed to store viz mode metric.", error: new Error("Error for viz mode metric") });
  }
});
