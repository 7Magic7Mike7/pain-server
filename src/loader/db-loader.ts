/*
 * File attribution
 * edited by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 */
// Copyright © 2026 Michael Artner
import { Pool } from 'pg';

import { PAIN_ORIGINS, PainDbConfig, PainOrigin, SurveyStepNumber, UserDbConfig } from '../config/db-config';
import { LOGGER } from '../config/log-config';
import { parsePainOrigin } from '../validation/input-validator';
import { EXPERIMENTAL_LAYER_PREFIX, isExperimentalLayer } from '../config/layer-config';
import { generateUserId } from '../config/user-config';
import { Coordinate } from '../coordinate-computer';
import type { InteractionBatch } from '../validation/interaction-events';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pain_db';
const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000,
  statement_timeout: 15000, query_timeout: 20000 });
const logger = LOGGER.child({ service: "DBLoader" });   // logs db queries

/** One database round trip per batch; retries do not create duplicate events. */
export async function storeInteractionBatch(batch: InteractionBatch): Promise<number | null> {
  const result = await pool.query(`
    WITH visitor AS (SELECT id FROM ${UserDbConfig.TN_USERS} WHERE ${UserDbConfig.COL_USER_ID} = $1),
    inserted AS (
      INSERT INTO interactionevents
        (userid, tabid, seq, event_type, target, action, country, emotion, enabled, layer,
         step, count, selected_count, has_text, characters, duration_ms, survey_consent, occurred_at)
      SELECT visitor.id, $2::uuid, e.seq, e.type, e.target, e.action, e.country, e.emotion,
        e.enabled, e.layer, e.step, e.count, e."selectedCount", e."hasText", e.characters,
        e."durationMs", $4, to_timestamp(e."atMs" / 1000.0)
      FROM visitor CROSS JOIN jsonb_to_recordset($3::jsonb) AS e
        (seq bigint, type text, target text, action text, country text, emotion text,
         enabled boolean, layer text, step smallint, count integer, "selectedCount" integer,
         "hasText" boolean, characters integer, "durationMs" integer, "atMs" bigint)
      ON CONFLICT (tabid, seq) DO NOTHING RETURNING id
    ) SELECT EXISTS(SELECT 1 FROM visitor) AS known, (SELECT count(*) FROM inserted)::integer AS accepted`,
  [batch.userId, batch.tabId, JSON.stringify(batch.events), batch.consent]);
  return result.rows[0].known ? result.rows[0].accepted : null;
}

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

/**
 * 
 * @param layer the layer to retrieve data from
 * @returns all data points associated with the given layer
 * @throws DB errors if a query fails, a regular error if layer is invalid or an experimental layer is passed outside DEV_MODE
 */
export async function getPainLayer(layer: string): Promise<PainData[]> {
  if (isExperimentalLayer(layer)) {
    const category = layer.substring(EXPERIMENTAL_LAYER_PREFIX.length)
    logger.database(`Fetching data from experimental table, category = ${category}`);
    return pool.query(
      `SELECT * FROM ${PainDbConfig.TN_EXPERIMENTAL} 
      WHERE ${PainDbConfig.COL_AGGRID} IS NULL 
      AND ${PainDbConfig.COL_CATEGORY}=$1`,
      [category]
    ).then((result: { rows: PainData[]; }) => result.rows);
  }
  else {
    const table = parsePainOrigin(layer);
    if (table === null) {
      throw new Error("Layer must not be null!");
    }
    logger.debug(`Fetching data from table=\"${table}\"`);
    // note that table names cannot be substituted with query arguments and have to be inserted directly
    return pool.query(`SELECT * FROM ${table} WHERE ${PainDbConfig.COL_AGGRID} IS NULL`)
      .then((result: { rows: PainData[]; }) => result.rows);
  }
}

// TODO: improve parameter names? cause on one hand "userId" refers to a string identifying the user, 
//       and on the other hand it is the id of the "Users" table
async function getUserDbId(userId: string): Promise<number | undefined> {
  const result = await pool.query(`SELECT ${UserDbConfig.COL_ID} FROM ${UserDbConfig.TN_USERS} WHERE ${UserDbConfig.COL_USER_ID} = $1`, [userId]);
  const resRow = result.rows[0];
  return resRow ? resRow[UserDbConfig.COL_ID] : undefined;
}

/**
 * Searches for a data point from the database table corresponding to painOrigin such that no other
 * data point has a pain value closer to painValue. This is achieved by asking the database to find
 * all rows with a bigger pain value and sorting them ascendingly, then findng all rows with a smaller
 * pain value and sorting them descendingly, and finally returning the closer of the two resulting
 * data points.
 * 
 * @param painOrigin the table to search
 * @param painValue the value to compare data points to
 * @returns the data point from the database that has the closest pain value to painValue
 * @throws Error if painOrigin is invalid or no data point was found
 */
export async function getClosestDataPoint(painOrigin: PainOrigin, painValue: number): Promise<PainData> {
  if (!PAIN_ORIGINS.includes(painOrigin)) {
    throw new Error(`Cannot search for closest data point of invalid painOrigin = ${painOrigin}.`);
  }
  logger.debug(`Getting closest data point to ${painValue} from ${painOrigin}`);
  const resDataPoint = await pool.query(
    `SELECT ${PainDbConfig.COL_ID} FROM
    (
      (SELECT ${PainDbConfig.COL_ID}, ${PainDbConfig.COL_VALUE} FROM ${painOrigin}
        WHERE ${PainDbConfig.COL_AGGRID} IS NULL AND ${PainDbConfig.COL_VALUE} >= $1
        ORDER BY ${PainDbConfig.COL_VALUE} LIMIT 1)
      UNION ALL
      (SELECT ${PainDbConfig.COL_ID}, ${PainDbConfig.COL_VALUE} FROM ${painOrigin}
        WHERE ${PainDbConfig.COL_AGGRID} IS NULL AND ${PainDbConfig.COL_VALUE} < $1
        ORDER BY ${PainDbConfig.COL_VALUE} DESC LIMIT 1)
    )
    ORDER BY abs($1 - ${PainDbConfig.COL_VALUE}) LIMIT 1;`,
    [painValue]
  );
  logger.debug(`  resDataPoint.rows[0] = ${JSON.stringify(resDataPoint.rows[0])}`);
  if (resDataPoint.rows[0]) {
    const dbId = resDataPoint.rows[0][PainDbConfig.COL_ID];
    const result = await pool.query(`SELECT * FROM ${painOrigin} WHERE ${PainDbConfig.COL_ID} = $1`, [dbId]);
    logger.debug(`  result.rows[0] = ${JSON.stringify(result.rows[0])}`);
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
/**
 * 
 * @returns a unique userId (alphanumeric)
 * @throws if no unique userId could be created and stored in the database
 */
export async function registerUser(): Promise<string> {
  logger.debug("registerUser()");
  for (let i = 0; i < REGISTRATION_ATTEMPTS; i++) {
    const userId = generateUserId();
    const result = await pool.query(
      `SELECT EXISTS(
          SELECT 1
          FROM ${UserDbConfig.TN_USERS}
          WHERE ${UserDbConfig.COL_USER_ID} = $1
      ) AS exists`,
      [userId]
    );
    const exists = result.rows[0].exists;
    if (!exists) {
      // Insert new user
      const result = await pool.query(`INSERT INTO ${UserDbConfig.TN_USERS} (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}) VALUES (NOW(), $1)`, [userId]);
      if (result.rowCount) {
        logger.database(`Successfully inserted userId=\"${userId}\".`);
        return userId;
      }
      else {
        logger.database(`Failed to insert userId=\"${userId}\" - ${REGISTRATION_ATTEMPTS-i-1} retries with new userIds left.`)
      }
    }
    else {
      // UserId already exists
      logger.database(`User with userId=\"${userId}\" already exists - ${REGISTRATION_ATTEMPTS-i-1} retries with new userIds left.`);
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
 * @returns whether the metric was successfully stored or not
 * @throws DB errors if a query fails, a regular error if userId does not exist in the database
 */
export async function storeToggleMetric(userId: string, kind: string, element: string, enabled: boolean): Promise<boolean> {
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId: \"${userId}\" does not exist!`);
  }
  const result = await pool.query(
    `INSERT INTO ${UserDbConfig.TN_TOGGLE} 
    (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_KIND}, ${UserDbConfig.COL_ELEM}, ${UserDbConfig.COL_ENABLED})
    VALUES
    (NOW(), $1, $2, $3, $4)`, 
    [dbId, kind, element, enabled]
  );
  if (result.rowCount) {
    logger.debug(`Successfully stored toggle metric for userId=\"${userId}\".`);
    return true;
  }
  return false;
}

/**
 * 
 * @param userId the userId the values we want to store belong to
 * @param step the step value we want to store
 * @returns whether the metric was successfully stored or not
 * @throws DB errors if a query fails, a regular error if userId does not exist in the database
 */
export async function storeStepMetric(userId: string, step: SurveyStepNumber): Promise<boolean> {
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId! \"${userId}\" does not exist.`);
  }
  const result = await pool.query(
    `INSERT INTO ${UserDbConfig.TN_STEP} 
    (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_STEP})
    VALUES
    (NOW(), $1, $2)`,
    [dbId, step]
  );
  if (result.rowCount) {
    logger.debug(`Successfully stored step metric for userId=\"${userId}\".`);
    return true;
  }
  return false;
}

/**
 * 
 * @param userId the userId the values we want to store belong to
 * @param step the step value we want to store
 * @returns whether the metric was successfully stored or not
 * @throws DB errors if a query fails, a regular error if userId does not exist in the database
 */
export async function storeVisModeMetric(userId: string, mode: string): Promise<boolean> {
  const dbId = await getUserDbId(userId);
  if (dbId == null) {
    throw new Error(`Invalid userId! \"${userId}\" does not exist.`);
  }
  const result = await pool.query(
    `INSERT INTO ${UserDbConfig.TN_VIS} 
    (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_VIS_MODE})
    VALUES
    (NOW(), $1, $2)`,
    [dbId, mode]
  );
  if (result.rowCount) {
    logger.debug(`Successfully stored vis mode metric for userId=\"${userId}\".`);
    return true;
  }
  return false;
}

/**
 * 
 * @param userId id of the user the coordinate belongs to
 * @param coordinate coordinate that resulted from a user's survey input
 * @returns whether the metric was successfully stored or not
 * @throws DB errors if a query fails, a regular error if userId does not exist in the database or coordinate is invalid
 */
export async function storeUserCoordinate(userId: string, coordinate: Coordinate): Promise<boolean> {
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
    throw new Error(`Invalid userId! \"${userId}\" does not exist.`);
  }
  // store the data
  const result = await pool.query(
    `INSERT INTO ${UserDbConfig.TN_USER_COORDINATES} 
    (${UserDbConfig.COL_DT}, ${UserDbConfig.COL_USER_ID}, ${UserDbConfig.COL_LAT}, ${UserDbConfig.COL_LNG})
    VALUES
    (NOW(), $1, $2, $3)`,
    [dbId, coordinate.lat, coordinate.lng]
  );
  if (result.rowCount) {
    logger.debug(`Successfully stored user coordinate for userId=\"${userId}\".`);
    return true;
  }
  return false;
}

LOGGER.database(`Using DB config: ${PainDbConfig.toString()}`);
