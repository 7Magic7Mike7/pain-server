import { PainDbConfig } from "../config/db-config";
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
    logger.info(`Parsing experimental layer = ${painOrigin}`);
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
