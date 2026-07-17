import { Pool } from 'pg';

import { PainDbConfig, SurveyStepNumber, UserDbConfig } from '../config/db-config';
import { LOGGER } from '../config/log-config';
import { parsePainOrigin } from '../validation/input-validator';
import { EXPERIMENTAL_LAYER_PREFIX, isExperimentalLayer } from '../config/layer-config';
import { generateUserId } from '../config/user-config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pain_db';
const pool = new Pool({ connectionString });
const logger = LOGGER.child({ service: "DBLoader" });   // logs db queries

type PainData = {
    id: number;
    aggrId: number;
    value: number;
    category: string;
    lat?: number;
    lng?: number;
    country?: string;
    word?: string;
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

// TODO: improve parameter names? cause on one hand "userId" refers to a string identifying the user, 
//       and on the other hand it is the id of the "Users" table
export async function getUserDbId(userId: string): Promise<number | undefined> {
  const result = await pool.query(`SELECT ${UserDbConfig.COL_ID} FROM ${UserDbConfig.TN_USERS} WHERE ${UserDbConfig.COL_USER_ID} = $1`, [userId]);
  const resRow = result.rows[0];
  return resRow ? resRow[UserDbConfig.COL_ID] : undefined;
}


// ######################################################################################
// insert operations
// ######################################################################################

const REGISTRATION_ATTEMPTS = 32;
export async function registerUser(): Promise<string> {
  logger.database("registerUser()");
  for (let i = 0; i < REGISTRATION_ATTEMPTS; i++) {
    const userId = generateUserId();
    // todo: save in DB or repeat if userId already exists
    const result = await pool.query(
      `SELECT EXISTS(
          SELECT 1
          FROM ${UserDbConfig.TN_USERS}
          WHERE ${UserDbConfig.COL_USER_ID} = $1
      ) AS exists`,
      [userId]
    );
    const exists = result.rows[0].exists;
    if (exists) {
      // UserId already exists
      logger.database(`UserID ${userId} already exists - ${REGISTRATION_ATTEMPTS-i-1} retries with new userIds left.`);
      continue;
    }
    else {
      // Insert new player
      logger.database(`Inserting new userId: ${userId}`);
      const result = await pool.query(`INSERT INTO ${UserDbConfig.TN_USERS} (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}) VALUES (NOW(), $1)`, [userId]);
      if (result.rowCount) {
        logger.database(`  UserId ${userId} inserted successfully.`);
        return userId;
      }
    }
  }
  throw new Error(`Failed to create a unique userId within ${REGISTRATION_ATTEMPTS}.`);
}

/**
 * 
 * @param userId the userId the values we want to store belong to
 * @param kind the kind value we want to store
 * @param element the element value we want to store
 * @param enabled the enabled value we want to store
 * @throws DB errors if a query fails, a regular error if userId is not stored in the database
 */
export async function storeToggleMetric(userId: string, kind: string, element: string, enabled: boolean): Promise<void> {
  logger.database("storeToggleMetric()");
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId! "${userId}" does not exist.`);
  }
  else {
    // todo: should we validate the parameters?
    const query = `INSERT INTO ${UserDbConfig.TN_TOGGLE} 
      (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_KIND}, ${UserDbConfig.COL_ELEM}, ${UserDbConfig.COL_ENABLED})
      VALUES
      (NOW(), $1, $2, $3, $4)`;
    const result = await pool.query(query, [dbId, kind, element, enabled]);
    if (result.rowCount) {
      logger.database("Successfully stored toggle metric.");
    }
    else {
      throw new Error("Unknown error while storing toggle metric.");
    }
  }
}

/**
 * 
 * @param userId the userId the values we want to store belong to
 * @param step the step value we want to store
 * @throws DB errors if a query fails, a regular error if userId is not stored in the database
 */
export async function storeStepMetric(userId: string, step: SurveyStepNumber): Promise<void> {
  logger.database("storeStepMetric()");
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId! "${userId}" does not exist.`);
  }
  else {
    // todo: should we validate the parameter?
    const query = `INSERT INTO ${UserDbConfig.TN_STEP} 
      (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_STEP})
      VALUES
      (NOW(), $1, $2)`;
    const result = await pool.query(query, [dbId, step]);
    if (result.rowCount) {
      logger.database("Successfully stored step metric.");
    }
    else {
      throw new Error("Unknown error while storing step metric.");
    }
  }
}

/**
 * 
 * @param userId the userId the values we want to store belong to
 * @param step the step value we want to store
 * @throws DB errors if a query fails, a regular error if userId is not stored in the database
 */
export async function storeVisModeMetric(userId: string, mode: string): Promise<void> {
  logger.database("storeVisModeMetric()");
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId! "${userId}" does not exist.`);
  }
  else {
    // todo: should we validate the parameter?
    const query = `INSERT INTO ${UserDbConfig.TN_VIS} 
      (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_VIS_MODE})
      VALUES
      (NOW(), $1, $2)`;
    const result = await pool.query(query, [dbId, mode]);
    if (result.rowCount) {
      logger.database("Successfully stored vis mode metric.");
    }
    else {
      throw new Error("Unknown error while storing vis mode metric.");
    }
  }
}

LOGGER.database(`Using DB config: ${PainDbConfig.toString()}`);
