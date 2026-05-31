import { Pool } from 'pg';

import { parseOrigin } from './input-validator';
import { DbConfig } from './config/db-config';
import { LOGGER } from './config/log-config';

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
export async function getRowById(id: number) {
  const result = await pool.query(`SELECT * FROM ${DbConfig.TABLE_NAME} WHERE ${DbConfig.TABLE_COLUMN_ID} = $1`, [id]);
  return result.rows[0];
}

export function syncGetRowById(id: number): Promise<PainData> {
  return pool.query(`SELECT * FROM ${DbConfig.TABLE_NAME} WHERE ${DbConfig.TABLE_COLUMN_ID} = $1`, [id])
    .then((result: { rows: PainData[]; }) => result.rows[0])
    .catch((err: any) => {
      console.error('Error executing query', err);
      throw err;
    });
}

export async function getPainLayer(layer: string): Promise<PainData[]> {
  const painOrigins = parseOrigin(layer);
  if (painOrigins === null) {
    throw new Error("Layer must not be null!");
  }
  if (painOrigins === undefined) {
    throw new Error("Layer must not be undefined!");
  }
  return Promise.all(painOrigins.map(origin => {
    logger.database(`Fetching data for pain origin: ${origin}`);
    return pool.query(`SELECT * FROM ${DbConfig.TABLE_NAME} WHERE ${DbConfig.TABLE_COLUMN_PAINORIGIN} = $1`, [origin])
      .then((result: { rows: PainData[]; }) => result.rows);
  }))
    .then(results => results.flat());
}

LOGGER.database(`Using DB config: TABLE_NAME=${DbConfig.TABLE_NAME}, ID_COL=${DbConfig.TABLE_COLUMN_ID}, LAT_COL=${DbConfig.TABLE_COLUMN_LAT}, LNG_COL=${DbConfig.TABLE_COLUMN_LNG}, VALUE_COL=${DbConfig.TABLE_COLUMN_VALUE}, DATATYPE_COL=${DbConfig.TABLE_COLUMN_DATATYPE}, PAINORIGIN_COL=${DbConfig.TABLE_COLUMN_PAINORIGIN}`);
