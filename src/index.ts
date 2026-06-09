import express from 'express';
import path from 'path';
import { app } from "./app";
import { ServerConfig } from './config/server-config';
import { LOGGER } from './config/log-config';

app.use(express.json());

// Serve static files from public directory (frontend)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(ServerConfig.PORT, () => {
  LOGGER.info(`Server running at http://localhost:${ServerConfig.PORT}/`);
});
