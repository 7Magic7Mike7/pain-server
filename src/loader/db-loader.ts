import { Pool } from 'pg';

import { PainDbConfig } from '../config/db-config';
import { LOGGER } from '../config/log-config';
import { parsePainOrigin } from '../validation/input-validator';
import { EXPERIMENTAL_LAYER_PREFIX, isExperimentalLayer } from '../config/layer-config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pain_db';
const pool = new Pool({ connectionString });
const logger = LOGGER.child({ service: "DBLoader" });   // logs db queries

type PainData = {
    id: number;
    lat: number;
    lng: number;
    value: number;
    datatype: string;
    painorigin: string;
}

// Parameterized query (prevents SQL injection)
export async function getRowById(id: number, painOrigin: string) {
  const table = parsePainOrigin(painOrigin);
  if (table === null) {
    throw new Error("Layer must not be null!");
  }
  const result = await pool.query(`SELECT * FROM $1 WHERE ${PainDbConfig.COL_ID} = $2`, [table, id]);
  return result.rows[0];
}

export async function getPainLayer(layer: string): Promise<PainData[]> {
  logger.database("getPainLayer()");
  if (isExperimentalLayer(layer)) {
    const category = layer.substring(EXPERIMENTAL_LAYER_PREFIX.length)
    logger.database(`Fetching data from experimental table, category = ${category}`);
    const query = 
      `SELECT * FROM ${PainDbConfig.TN_EXPERIMENTAL} 
      WHERE ${PainDbConfig.COL_AGGRID} IS NULL 
      AND ${PainDbConfig.COL_CATEGORY}=$1`;
    logger.database(`query = ${query}`);
    return pool.query(query, [category])
      .then((result: { rows: PainData[]; }) => result.rows);
  }
  else {
    const table = parsePainOrigin(layer);
    if (table === null) {
      throw new Error("Layer must not be null!");
    }
    logger.database(`Fetching data from table = ${table}`);
    // note that table names cannot be substituted with query arguments and have to be inserted directly
    const query = `SELECT * FROM ${table} WHERE ${PainDbConfig.COL_AGGRID} IS NULL`;
    logger.database(`query = ${query}`);
    return pool.query(query)
      .then((result: { rows: PainData[]; }) => result.rows);
  }
}

LOGGER.database(`Using DB config: ${PainDbConfig.toString()}`);
