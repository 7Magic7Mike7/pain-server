import { DbConfig } from "./config/db-config";

// pain origins according to the database

/**
 * Parses origin and returns an array of corresponding origin-values present in the database.
 * Supports:
 * - the straightforward case-insensitive mapping of input to known pain origins
 * 
 * @param painOrigin string representing a pain origin
 * @returns database valid origin(s) if the input is valid, empty array if the input does not match any origins, null if the input is invalid
 */
export function parsePainOrigin(painOrigin: string): string[] | null {
  // TODO: only support strict origins later!
  if (painOrigin === null || painOrigin === undefined) {
    return null;
  }
  // normalize the input (i.e., trim whitespace and convert to lowercase)
  let norm_origin = painOrigin.trim().replace(" ", "").toLowerCase();
  switch (norm_origin) {
    // cases where origin is exactly one of the pain origins (case-insensitive)
    case DbConfig.PO_ENV_NAT.toLowerCase():
      return [DbConfig.PO_ENV_NAT];
    case DbConfig.PO_ENV_ANTRO.toLowerCase():
      return [DbConfig.PO_ENV_ANTRO];
    case DbConfig.PO_EMO.toLowerCase():
      return [DbConfig.PO_EMO];
    case DbConfig.PO_PHYS.toLowerCase():
      return [DbConfig.PO_PHYS];
    case DbConfig.PO_SOCIOECO.toLowerCase():
      return [DbConfig.PO_SOCIOECO];

    // cases where origin is the full name
    case "environmentalnatural":
      return [DbConfig.PO_ENV_NAT];
    case "environmentalanthropogenic":
      return [DbConfig.PO_ENV_ANTRO];
    case "emotional":
      return [DbConfig.PO_EMO];
    case "physical":
      return [DbConfig.PO_PHYS];
    case "socioeconomic":
      return [DbConfig.PO_SOCIOECO];

    // cases that combine multiple origins
    case DbConfig.PO_ENV.toLowerCase():
    case "environmental":
    case "planetary":
      return [DbConfig.PO_ENV_NAT, DbConfig.PO_ENV_ANTRO];
    case "human":
    case "individual":
    case "personal":
      return [DbConfig.PO_EMO, DbConfig.PO_PHYS, DbConfig.PO_SOCIOECO];
    case "all":
      return [DbConfig.PO_ENV_NAT, DbConfig.PO_ENV_ANTRO, DbConfig.PO_EMO, DbConfig.PO_PHYS, DbConfig.PO_SOCIOECO];

    // unknown origin
    default:
      return [];
  }
}
