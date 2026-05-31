import express from 'express';
import path from 'path';
import { getRowById, getPainLayer } from './scripts/db-loader';
import { LOGGER } from './scripts/config/log-config';
import { ServerConfig } from './scripts/config/server-config';

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

const app = express();
app.use(express.json());

// Serve static files from public directory (frontend)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(ServerConfig.PORT, () => {
  logger.info(`Server running at http://localhost:${ServerConfig.PORT}/`);
});

// ###################################
//        Debug Endpoints
// ###################################
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

// ###################################
//        Frontend Initialization Endpoints
// ###################################
// send all data points for a layer
app.get('/init/:layer', async (req, res) => {
  const { layer } = req.params;
  const apipath =  `/init/${layer}`;
  apilog("GET", apipath);
  try {
    const data = await getPainLayer(layer);
    logger.apiinfo(`Responding with ${data.length} data points for ${apipath}`);
    res.json(data);
  }
  catch (error) {
    apierror(apipath, error);
    res.status(500).json({ error: 'Failed to fetch pain layer with ' + error });
  }
});

// SPA fallback: serve index.html for non-API routes
//app.use((req, res, next) => {
//  if (req.path.startsWith('/api')) return next();
//  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});
