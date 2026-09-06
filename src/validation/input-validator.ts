// Copyright © 2026 Michael Artner
import { PainDbConfig, SurveyStepNumber, UserDbConfig } from "../config/db-config";
import { isExperimentalLayer } from "../config/layer-config";
import { LOGGER } from "../config/log-config";
import { ServerConfig } from "../config/server-config";

const logger = LOGGER.child({ service: "Validator" });

/**
 * Parses origin and returns the corresponding table name in the database.
 * Supports:
 * - the straightforward case-insensitive mapping of input to known pain origins
 * - full names of the abbreviated table names
 * - painOrigins starting with the EXPERIMENTAL_LAYER_PREFIX are not parsed and returned as-is
 * 
 * @param painOrigin string representing a pain origin
 * @returns database table name if the input is valid, null if the input is invalid or does not match any supported pain origin
 */
export function parsePainOrigin(painOrigin: string): string | null {
  // TODO: only support strict origins later!
  if (painOrigin === null || painOrigin === undefined) {
    return null;
  }
  if (ServerConfig.DEV_MODE && isExperimentalLayer(painOrigin)) {
    logger.debug(`Parsing experimental layer = ${painOrigin}`);
    return painOrigin;
  }
  // normalize the input (i.e., trim whitespace and convert to lowercase)
  let norm_origin = painOrigin.trim().replace(" ", "").toLowerCase();
  switch (norm_origin) {
    // cases where origin is exactly one of the pain origins
    case PainDbConfig.TN_ENV:
      return PainDbConfig.TN_ENV;
    case PainDbConfig.TN_EMO:
      return PainDbConfig.TN_EMO;
    case PainDbConfig.TN_PHYS:
      return PainDbConfig.TN_PHYS;
    case PainDbConfig.TN_SOCIOECO:
      return PainDbConfig.TN_SOCIOECO;

    // cases where origin is the full name
    case "environmental":
      return PainDbConfig.TN_ENV;
    case "emotional":
      return PainDbConfig.TN_EMO;
    case "physical":
      return PainDbConfig.TN_PHYS;
    case "socioeconomical":
      return PainDbConfig.TN_SOCIOECO;

    // unknown origin
    default:
      return null;
  }
}

// Source - https://stackoverflow.com/a/25352300
// Posted by Michael Martin-Smucker
// Retrieved 2026-09-06, License - CC BY-SA 3.0

/**
 * 
 * @param text the string to validate
 * @param allowLower whether lower-case letters are valid (default = true)
 * @param allowUpper whether upper-case letters are valid (default = true)
 * @param allowNumber whether numbers are valid (default = true)
 * @param allowDash whether "-" is valid (default = false)
 * @param allowWhitespace whether " " is valid (default = false)
 * @returns true if userId only contains allowed characters, false otherwise (also false if all flags are false since nothing will be allowed)
 */
export function isValidString(text: string, allowLower?: boolean, allowUpper?: boolean, allowNumber?: boolean, allowDash?: boolean, allowWhitespace?: boolean): boolean {
  if (allowLower === undefined) {
    allowLower = true;
  }
  if (allowUpper === undefined) {
    allowUpper = true;
  }
  if (allowNumber === undefined) {
    allowNumber = true;
  }
  if (allowDash === undefined) {
    allowDash = false;
  }
  if (allowWhitespace === undefined) {
    allowWhitespace = false;
  }
  let code, i, len;
  for (i = 0, len = text.length; i < len; i++) {
    code = text.charCodeAt(i);
    let isValid = false;
    if (allowNumber && (code > 47 && code < 58)) {        // numeric (0-9)
      isValid = true;
    }
    else if (allowUpper && (code > 64 && code < 91)) {    // upper alpha (A-Z)
      isValid = true;
    }
    else if (allowLower && (code > 96 && code < 123)) {   // lower alpha (a-z)
      isValid = true;
    }
    else if (allowDash && code === 45) {
      isValid = true;
    }
    else if (allowWhitespace && code == 32) {
      isValid = true;
    }
    if (!isValid) {
      return false;
    }
  }
  return true;
};

const MAX_LEN_KIND = 40;
const MAX_LEN_ELEMENT = 40;
export function validateToggleMetric(kind: any, element: any, enabled: any): { isValid: boolean, info: string} {
  // validate types
  if (typeof kind !== "string") {
    return { isValid: false, info: `Invalid type of kind = ${typeof kind}` };
  }
  if (typeof element !== "string") {
    return { isValid: false, info: `Invalid type of element = ${typeof kind}` };
  }
  if (typeof enabled !== "boolean") {
    return { isValid: false, info: `Invalid type of enabled = ${typeof kind}` };
  }
  // validate kind
  if (kind.length > MAX_LEN_KIND) {
    return { isValid: false, info: `Kind is longer than ${MAX_LEN_KIND} characters` };
  }
  if (!isValidString(kind, true, true, false)) {
    return { isValid: false, info: `Kind \"${kind}\" contains illegal characters` };
  }
  // validate element
  if (element.length > MAX_LEN_ELEMENT) {
    return { isValid: false, info: `Element is longer than ${MAX_LEN_ELEMENT} characters` };
  }
  if (!isValidString(element, true, true, false, true, true)) {
    return { isValid: false, info: `Element ${element} contains illegal characters` };
  }
  return { isValid: true, info: "" };
}

export function validateStepMetric(step: SurveyStepNumber): { isValid: boolean, info: string} {
  // validate types
  if (typeof step !== "number") {
    return { isValid: false, info: `Invalid type of step = ${typeof step}` };
  }
  // validate step
  if (step < 0 || 5 < step || step.toString().length > 1) {
    return { isValid: false, info: `Invalid value for step ${step}` };
  }
  return { isValid: true, info: "" };
}

const MAX_LEN_MODE = 40;
export function validateVisMetric(mode: any): { isValid: boolean, info: string} {
  // validate types
  if (typeof mode !== "string") {
    return { isValid: false, info: `Invalid type of mode = ${typeof mode}` };
  }
  // validate mode
  if (mode.length > MAX_LEN_MODE) {
    return { isValid: false, info: `Mode is longer than ${MAX_LEN_MODE} characters` };
  }
  if (!isValidString(mode, true, true, false, false)) {
    return { isValid: false, info: `Mode ${mode} contains illegal characters` };
  }
  return { isValid: true, info: "" };
}

const MAX_LEN_SURVEY_WORD = 40;
export function validateSurvey(consent: any, wordBubbles: any, wordBody: any, temporality: any, relations: any, painDescription: any): { isValid: boolean, info: string} {
  // validate types
  if (typeof consent !== "boolean") {
    return { isValid: false, info: `Invalid type of consent = ${typeof consent}` };
  }
  if (wordBubbles) {
    if (!Array.isArray(wordBubbles)) {
      return { isValid: false, info: `wordBubbles is not an array` };
    }
    if (wordBubbles.length > 0 && typeof wordBubbles[0] !== "string") {
      return { isValid: false, info: `Invalid type of wordBubbles[0] = ${typeof wordBubbles[0]}` };
    }
  }
  if (wordBody) {
    if (!Array.isArray(wordBody)) {
      return { isValid: false, info: `wordBody is not an array` };
    }
    if (wordBody.length > 0 && typeof wordBody[0] !== "object") {
      return { isValid: false, info: `Invalid type of wordBody[0] = ${typeof wordBody[0]}` };
    }
  }
  if (temporality) {
    if (!Array.isArray(temporality)) {
      return { isValid: false, info: `temporality is not an array` };
    }
    if (temporality.length > 0 && typeof temporality[0] !== "string") {
      return { isValid: false, info: `Invalid type of temporality[0] = ${typeof temporality[0]}` };
    }
  }
  if (relations) {
    if (!Array.isArray(relations)) {
      return { isValid: false, info: `relations is not an array` };
    }
    if (relations.length > 0 && typeof relations[0] !== "string") {
      return { isValid: false, info: `Invalid type of relations[0] = ${typeof relations[0]}` };
    }
  }
  if (painDescription) {
    if (typeof painDescription !== "string") {
      return { isValid: false, info: `Invalid type of painDescription = ${typeof painDescription}` };
    }
  }
  // validate wordBubbles
  for (const word of wordBubbles) {
    if (word.length > MAX_LEN_SURVEY_WORD) {
      return { isValid: false, info: `wordBubbles element is longer than ${MAX_LEN_SURVEY_WORD} characters` };
    }
    if (!isValidString(word, true, true, false, true, true)) {
      return { isValid: false, info: `wordBubbles element contains illegal characters` };
    }
  }
  // validate wordBody
  try {
    for (const wb of wordBody) {
      // word
      if (typeof wb.word !== "string") {
        return { isValid: false, info: `Invalid type of wordBody element.word = ${typeof wb.word}` };
      }
      if (wb.word.length > MAX_LEN_SURVEY_WORD) {
        return { isValid: false, info: `wordBody element.word is longer than ${MAX_LEN_SURVEY_WORD} characters` };
      }
      if (!isValidString(wb.word, true, true, false, true, true)) {
        return { isValid: false, info: `wordBody element.word contains illegal characters` };
      }
      // lat
      if (typeof wb.lat !== "number") {
        return { isValid: false, info: `Invalid type of wordBody element.lat = ${typeof wb.lat}` };
      }
      if (wb.lat < UserDbConfig.VAL_LAT_MIN || UserDbConfig.VAL_LAT_MAX < wb.lat) {
        return { isValid: false, info: `Value of wordBody element.lat out of range = ${wb.lat}` };
      }
      // lng
      if (typeof wb.lng !== "number") {
        return { isValid: false, info: `Invalid type of wordBody element.lng = ${typeof wb.lng}` };
      }
      if (wb.lng < UserDbConfig.VAL_LNG_MIN || UserDbConfig.VAL_LNG_MAX < wb.lng) {
        return { isValid: false, info: `Value of wordBody element.lng out of range = ${wb.lng}` };
      }
    }
  }
  catch (err) {
    logger.warn({ err }, "Failed to validate wordBody.");
    return { isValid: false, info: `Error while validating wordBody` };
  }

  // validate temporality
  for (const word of temporality) {
    if (word.length > MAX_LEN_SURVEY_WORD) {
      return { isValid: false, info: `temporality element is longer than ${MAX_LEN_SURVEY_WORD} characters` };
    }
    if (!isValidString(word, true, true, false, true, true)) {
      return { isValid: false, info: `temporality element contains illegal characters` };
    }
  }
  // validate relations
  for (const word of relations) {
    if (word.length > MAX_LEN_SURVEY_WORD) {
      return { isValid: false, info: `relations element is longer than ${MAX_LEN_SURVEY_WORD} characters` };
    }
    if (!isValidString(word, true, true, false, true, true)) {
      return { isValid: false, info: `relations element contains illegal characters` };
    }
  }
  return { isValid: true, info: "" };
}
