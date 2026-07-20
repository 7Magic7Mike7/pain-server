import { PAIN_ORIGINS, PainOrigin } from "./config/db-config";
import { LOGGER } from "./config/log-config";
import { getClosestDataPoint, PainData } from "./loader/db-loader";

const logger = LOGGER.child({ service: "CoordinateComputer" });

function extractCoordinate(dataPoint: PainData): Coordinate {
  logger.debug(`Extracting coordinate from datapoint = ${JSON.stringify(dataPoint)}`);
  if (dataPoint.country) {
    return { lat: 7, lng: 0 };  // todo: define coordinates for every country
  }
  else if(dataPoint.lat && dataPoint.lng) {
    return { lat: dataPoint.lat, lng: dataPoint.lng };
  }
  else {
    throw new Error(`Invalid dataPoint: TODO`);
  }
}

export type WordBody = {
  lat: number;
  lng: number;
  word: string;
}

export type Coordinate = {
  lat: number;
  lng: number;
}

export async function computeCoordinate(wordBubbles: string[], wordBody: WordBody[], temporality: string[], relations: string[], painDescription: string): Promise<Coordinate> {
  const painValues: Record<PainOrigin, { coor: Coordinate, weight: number }> = {};
  // TODO: perform actual computations
  for (const origin of PAIN_ORIGINS) {
    const val = Math.random();  // use random values for now
    const dataPoint = await getClosestDataPoint(origin, val);
    try {
      const coor = extractCoordinate(dataPoint);
      logger.info(`Found closest datapoint for ${origin} @ ${JSON.stringify(coor)} with weight = ${val}`);
      painValues[origin] = { coor, weight: val };
    }
    catch (error) {

    }
  }
  // average the found points
  const coordinate: Coordinate = { lat: 0, lng: 0 };
  let weightSum = 0.0;
  for (const { coor, weight} of Object.values(painValues)) {
    coordinate.lat += weight * coor.lat;
    coordinate.lng += weight * coor.lng;
    weightSum += weight;
  }
  if (weightSum == 0) {   // TODO: find a better way instead of returning (0|0)
    weightSum = 1.0;
  }
  return { lat: coordinate.lat / weightSum, lng: coordinate.lng / weightSum };
}


export const SURVEY_WORD_CATEGORIES = {
  emotional: [
    "grief",
    "solastalgia",
    "depression",
    "sadness",
    "anger",
    "apathy",
    "frustration",
    "confusion",
    "uncertainty",
    "panic",
    "fear",
    "mistrust",
  ],
  environmental: [
    "floods",
    "fires",
    "deforestation",
    "eruption",
    "toxicity",
    "heavy metals",
    "smog",
    "plastic pollution",
    "earthquake",
    "tsunami",
    "species extinction",
    "habitat loss",
  ],
  socioeconomic: [
    "corporate greed",
    "income inequality",
    "racism",
    "poverty",
    "discrimination",
    "capitalism",
    "patriarchy",
    "corruption",
    "consumerism",
    "surveillance",
  ],
  physical: [
    "asthma",
    "chronic pain",
    "suffering",
    "headache",
    "indigestion",
    "cancer",
    "muscle tension",
    "fatigue",
    "burnout",
    "arthritis",
    "aching",
    "numbing",
  ],
} as const;
