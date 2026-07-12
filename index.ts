import express from 'express';
import path from 'path';
import { app } from "./src/app";
import { ServerConfig } from './src/config/server-config';
import { LOGGER } from './src/config/log-config';

app.use(express.json());

// Serve static files from public directory (frontend)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(ServerConfig.PORT, () => {
  LOGGER.info(`Server running at http://localhost:${ServerConfig.PORT}/`);
});
