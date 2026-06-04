// pain origins according to the database
const PO_ENV_NAT = "EnvNat";
const PO_ENV_ANTRO = "EnvAntro";
const PO_EMO = "Emo";
const PO_PHYS = "Phys";
const PO_SOCIOECO = "Socioeco";

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
    case PO_ENV_NAT.toLowerCase():
      return [PO_ENV_NAT];
    case PO_ENV_ANTRO.toLowerCase():
      return [PO_ENV_ANTRO];
    case PO_EMO.toLowerCase():
      return [PO_EMO];
    case PO_PHYS.toLowerCase():
      return [PO_PHYS];
    case PO_SOCIOECO.toLowerCase():
      return [PO_SOCIOECO];

    // cases where origin is the full name
    case "environmentalnatural":
      return [PO_ENV_NAT];
    case "environmentalanthropogenic":
      return [PO_ENV_ANTRO];
    case "emotional":
      return [PO_EMO];
    case "physical":
      return [PO_PHYS];
    case "socioeconomic":
      return [PO_SOCIOECO];

    // cases that combine multiple origins
    case "env":
    case "environmental":
    case "planetary":
      return [PO_ENV_NAT, PO_ENV_ANTRO];
    case "human":
    case "individual":
    case "personal":
      return [PO_EMO, PO_PHYS, PO_SOCIOECO];
    case "all":
      return [PO_ENV_NAT, PO_ENV_ANTRO, PO_EMO, PO_PHYS, PO_SOCIOECO];

    // unknown origin
    default:
      return [];
  }
}
