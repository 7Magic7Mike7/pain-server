// Copyright © 2026 Michael Artner
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from "helmet";
import { getAllLayerInfo, LayerInfo, validateLayers } from './config/layer-config';
import { LOGGER } from './config/log-config';
import { ApiConfig, ServerConfig } from './config/server-config';
import { registerUser, storeToggleMetric, storeVisModeMetric, storeUserCoordinate, storeInteractionBatch } from './loader/db-loader';
import { parsePainOrigin, validateSurvey } from './validation/input-validator';
import { getLayerResponse, getCompressedLayerResponse } from './loader/layer-response';
import { EMOTIONS, LAYERS, parseInteractionBatch, validUserId } from './validation/interaction-events';
import { computeCoordinate, Coordinate } from './coordinate-computer';
import { validateUserId } from './config/user-config';
import { validSurveyInput } from './validation/survey-input';
import { requestLimits } from './request-limits';


// ######################################################################################
export const app = express();

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

app.use('/metrics', requestLimits(6000));
app.post('/metrics/events', express.json({ limit: '16kb', strict: true }), async (req, res) => {
  const batch = parseInteractionBatch(req.body);
  if (!batch) { res.status(400).json({ message: 'Invalid interaction batch.' }); return; }
  try {
    const accepted = await storeInteractionBatch(batch);
    if (accepted === null) { res.status(400).json({ message: 'Unknown session.' }); return; }
    res.status(200).json({ accepted });
  } catch {
    // Never serialize rejected content or database errors containing submitted parameters.
    res.status(503).json({ message: 'Interaction storage unavailable.' });
  }
});
app.use(express.json({ limit: "100kb" }));



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
app.head('/init', (_req, res) => { res.set('Allow', 'GET').sendStatus(405); });
app.get('/init', requestLimits(600), async (req, res) => {
  apiinfo("GET", "/init");
  try {
    const userId = await registerUser();
    return res.json({ userId, layerInfo: Object.values(layerInfo) });
  }
  catch (error) {
    apierror(ApiConfig.INIT, USER_UNINITIALIZED, error);
    res.status(500).json({ message: "Error while registering user." });
  }
});

// send all (fully aggregated) data points for a layer
app.get(`${ApiConfig.INIT}/:layer`, async (req, res) => {
  const { layer } = req.params;
  const apipath =  `/init/${layer}`;
  apiinfo("GET", apipath);
  if (Object.prototype.hasOwnProperty.call(layerInfo, layer)) {
    try {
      const data = await getLayerResponse(layer);
      logger.debug(`Responding with ${data.count} data points for ${apipath}`);
      res.vary('Accept-Encoding');
      const encoding = req.acceptsEncodings('gzip', 'identity');
      if (!encoding) { res.sendStatus(406); return; }
      const body = encoding === 'gzip' ? await getCompressedLayerResponse(data) : data.body;
      if (encoding === 'gzip') res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json; charset=utf-8').send(body);
    }
    catch (error) {
      apierror(apipath, USER_UNINITIALIZED, error);
      res.status(500).json({ message: "Failed to fetch pain layer." });
    }
  }
  else {
    const errmsg = `${layer} is not among the known layers!`;
    apierror(apipath, USER_UNINITIALIZED, new Error(errmsg));
    res.status(404).json({ message: "Unknown pain layer." });
  }
});


// ######################################################################################
//        User Survey Endpoints
// ######################################################################################

app.post(ApiConfig.SURVEY, requestLimits(600), async (req, res) => {
  apiinfo("POST", ApiConfig.SURVEY);
  if (!validSurveyInput(req.body)) { res.status(400).json({message:'Invalid survey input.'}); return; }
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
    logger.apierror('Survey processing failed.');  // todo: should these really use apierror if they don't fail due to API reasons?
    res.status(500).json({ message: "Failed to compute coordinate from survey." });
    return;
  }
  try {
    const messageResponse = await fetch(`${PAIN_MESSAGE_URL}/survey`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
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
    logger.apierror('Survey processing failed.');  // todo: should these really use apierror if they don't fail due to API reasons?
    res.status(500).json({ message: "Failed to generate text from survey." });
    return;
  }
  if (coordinate && text) {
    try {
      // only store resulting coordinate if the user gave consent
      if (consent === true) {
        if (!await storeUserCoordinate(userId, coordinate)) {
          logger.error(`Failed to store user coordinate for userId=${userId}.`);
        }
      }
    }
    catch (error) {
      logger.apierror('Survey storage failed.');
    }
    return res.status(200).json({ lat: coordinate.lat, lng: coordinate.lng, text });
  }
  else {
    logger.apierror('Survey result unavailable.');
    return res.status(500).json({ message: 'Failed to complete survey.' });
  }
});


// ######################################################################################
//        User Metrics Endpoints
// ######################################################################################

app.post(ApiConfig.METRICS_TOGGLE, async (req, res) => {
  apiinfo("POST", ApiConfig.METRICS_TOGGLE);
  const { userId, kind, element, enabled } = req.body;
  // Old clients must not persist answer identity or arbitrary text through the legacy route.
  let safeElement: string | undefined;
  if (kind === 'layer' && LAYERS.includes(element)) safeElement = element;
  if (kind === 'category' && typeof element === 'string') {
    if (/^[A-Z]{3}:/.test(element)) safeElement = element.slice(0, 3);
    if (element.startsWith('emotion-filter:') && EMOTIONS.includes(element.slice(15))) safeElement = element;
    if (['festival:visit', 'festival:workshop'].includes(element)) safeElement = element;
  }
  if (!validUserId(userId) || typeof enabled !== 'boolean' || !safeElement ||
      Object.keys(req.body).some(k => !['userId', 'kind', 'element', 'enabled'].includes(k))) {
    res.status(400).json({ message: 'Invalid legacy metric.' }); return;
  }

  try {
    await storeToggleMetric(userId, kind, safeElement, enabled);
    res.status(200).send();
  }
  catch (error) {
    logger.apierror('Legacy metric storage failed.');
    res.status(500).json({ message: 'Failed to store metric.' });
  }
});

// Old survey-step requests lack consent. New clients use validated consent-bearing batches.
app.post(ApiConfig.METRICS_STEP, (_req, res) => {
  res.status(400).json({ message: 'Use consent-bearing interaction batches.' });
});

app.post(ApiConfig.METRICS_VIZMODE, async (req, res) => {
  const { userId, mode } = req.body;
  if (!validUserId(userId) || !['points', 'scars', 'multiplex-v0'].includes(mode) ||
      Object.keys(req.body).some(k => !['userId', 'mode'].includes(k))) {
    res.status(400).json({ message: 'Invalid visualization metric.' }); return;
  }
  try { await storeVisModeMetric(userId, mode); res.sendStatus(200); }
  catch { res.status(503).json({ message: 'Metric storage unavailable.' }); }
});

// Express parser errors can retain the submitted body. Return only a fixed status message.
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error.status === 413 ? 413 : 400).json({ message: 'Invalid request body.' });
});

// SPA fallback: serve index.html for non-API routes
//app.use((req, res, next) => {
//  if (req.path.startsWith('/api')) return next();
//  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});
