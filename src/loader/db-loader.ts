import { Pool } from 'pg';

import { PainDbConfig, PainOrigin, SurveyStepNumber, UserDbConfig } from '../config/db-config';
import { LOGGER } from '../config/log-config';
import { parsePainOrigin } from '../validation/input-validator';
import { EXPERIMENTAL_LAYER_PREFIX, isExperimentalLayer } from '../config/layer-config';
import { generateUserId } from '../config/user-config';
import { Coordinate } from '../coordinate-computer';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pain_db';
const pool = new Pool({ connectionString });
const logger = LOGGER.child({ service: "DBLoader" });   // logs db queries

export type PainData = {
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

export async function getClosestDataPoint(painOrigin: PainOrigin, painValue: number): Promise<PainData> {
  // TODO: analyze time costs because of join on big tables
  // TODO: validate painOrigin!
  logger.database(`Getting closest data point to ${painValue} ${painOrigin}`);
  const query = `SELECT ${PainDbConfig.COL_ID} FROM
    (
      (SELECT ${PainDbConfig.COL_ID}, ${PainDbConfig.COL_VALUE} FROM ${painOrigin}
        WHERE ${PainDbConfig.COL_AGGRID} IS NULL AND ${PainDbConfig.COL_VALUE} >= $1
        ORDER BY ${PainDbConfig.COL_VALUE} LIMIT 1)
      UNION ALL
      (SELECT ${PainDbConfig.COL_ID}, ${PainDbConfig.COL_VALUE} FROM ${painOrigin}
        WHERE ${PainDbConfig.COL_AGGRID} IS NULL AND ${PainDbConfig.COL_VALUE} < $1
        ORDER BY ${PainDbConfig.COL_VALUE} DESC LIMIT 1)
    )
    ORDER BY abs($1 - ${PainDbConfig.COL_VALUE}) LIMIT 1;
  `;
  const resDataPoint = await pool.query(query, [painValue]);
  logger.info(`  resDataPoint.rows[0] = ${JSON.stringify(resDataPoint.rows[0])}`);
  if (resDataPoint.rows[0]) {
    const dbId = resDataPoint.rows[0][PainDbConfig.COL_ID];
    const result = await pool.query(`SELECT * FROM ${painOrigin} WHERE ${PainDbConfig.COL_ID} = $1`, [dbId]);
    logger.info(`  result.rows[0] = ${JSON.stringify(result.rows[0])}`);
    return result.rows[0];
  }
  else {
    throw new Error(`No closest datapoint found @${painOrigin} for pain=${painValue}. Make sure ${painOrigin} is initialized with data!`)
  }
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

export async function storeUserCoordinate(userId: string, coordinate: Coordinate): Promise<boolean> {
  logger.database("storeUserCoordinate()");
  // validate parameters
  if (coordinate.lat < UserDbConfig.VAL_LAT_MIN || UserDbConfig.VAL_LAT_MAX <= coordinate.lat) {
    throw new Error(`Invalid latitude: ${UserDbConfig.VAL_LAT_MIN} <= ${coordinate.lat} < ${UserDbConfig.VAL_LAT_MAX} must be true!`);
  }
  if (coordinate.lng < UserDbConfig.VAL_LNG_MIN || UserDbConfig.VAL_LNG_MAX <= coordinate.lng) {
    throw new Error(`Invalid longitude: ${UserDbConfig.VAL_LNG_MIN} <= ${coordinate.lng} < ${UserDbConfig.VAL_LNG_MAX} must be true!`);
  }
  // retrieve user from DB
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId! "${userId}" does not exist.`);
  }
  else {
    // store the data
    const query = `INSERT INTO ${UserDbConfig.TN_USER_COORDINATES} 
      (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_LAT}, ${UserDbConfig.COL_LNG})
      VALUES
      (NOW(), $1, $2, $3)`;
    const result = await pool.query(query, [dbId, coordinate.lat, coordinate.lng]);
    if (result.rowCount) {
      logger.database("Successfully stored user coordinate.");
      return true;
    }
  }
  return false;
}

LOGGER.database(`Using DB config: ${PainDbConfig.toString()}`);
