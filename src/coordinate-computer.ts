import { PAIN_ORIGINS, PainDbConfig, PainOrigin } from "./config/db-config";
import { LOGGER } from "./config/log-config";
import { getClosestDataPoint, PainData } from "./loader/db-loader";

const logger = LOGGER.child({ service: "CoordinateComputer" });

const DECIMALS = 5;

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

/**
 * Matches a temporality word to its corresponding maximum achievable pain value
 */
const SURVEY_TEMPORALITY_TO_MAX_VALUE: Record<string, number> = {
  "days": 0.2,
  "weeks": 0.3,
  "months": 0.4,
  "years": 0.6,
  "many generations": 0.8,
  "my whole life": 1.0,
} as const;
const SURVEY_TEMPORALITY_DEFAULT_MAX_VALUE = 0.1;

enum PainState {
  VALID,
  EMPTY,
  ERROR,
};

function computePainValue(origin: string, wordBubbles: string[], wordBody: WordBody[], temporality: string[], relations: string[], painDescription: string): { value: number, words: string[], state: PainState } {
  let selectedOriginWords: string[] = [];
  try {
    // normalize the the entries of wordBubbles
    const selectedWords = new Set(
      wordBubbles.map((word) => word.trim().toLowerCase())
    );
    const originWords = SURVEY_WORD_CATEGORIES[origin];
    selectedOriginWords = originWords.filter((word) =>
      selectedWords.has(word.toLowerCase())
    );

    // compute the maximum achievable pain from all selected temporality words
    const maxPain = Math.max(...temporality.map((tempo) => SURVEY_TEMPORALITY_TO_MAX_VALUE[tempo]), 
                    SURVEY_TEMPORALITY_DEFAULT_MAX_VALUE);
    const pain = selectedOriginWords.length / originWords.length;
    logger.info(`computed a pain = ${pain} out of ${maxPain} for ${origin}`);
    return {
      value: Math.round(pain * maxPain * Math.pow(10, DECIMALS)) / Math.pow(10, DECIMALS),
      words: selectedOriginWords,
      state: (selectedOriginWords.length > 0) ? PainState.VALID : PainState.EMPTY,
    }
  }
  catch(error) {
    logger.error(`Error while computing pain value for ${origin}: ${JSON.stringify(error)}`);
    return {
      value: 0,
      words: selectedOriginWords,
      state: PainState.ERROR,
    }
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

type WeightedCoordinate = {
  coordinate: Coordinate;
  weight: number;
}

function extractWordBodyCoordinates(selectedOriginWords: string[], wordBody: WordBody[]): Coordinate[] {
  try {
    // TODO: error handling & logging
    const coordinates: Coordinate[] = [];
    for (const wb of wordBody) {
      logger.debug(`is ${wb.word} in ${JSON.stringify(selectedOriginWords)}?`);
      if (selectedOriginWords.includes(wb.word)) {
        coordinates.push({ lat: wb.lat, lng: wb.lng });
      }
    }
    logger.debug(`Extracted word body coordinates = ${JSON.stringify(coordinates)}`);
    return coordinates;
  }
  catch (error) {
    logger.error(`Error on extracting word body coordinates: ${JSON.stringify(error)}`);
    return [];
  }
}

export async function computeCoordinate(wordBubbles: string[], wordBody: WordBody[], temporality: string[], relations: string[], painDescription: string): Promise<Coordinate> {
  const painValues: WeightedCoordinate[] = [];
  for (const origin of PAIN_ORIGINS) {
    // compute a target pain value
    const { value, words, state } = computePainValue(origin, wordBubbles, wordBody, temporality, relations, painDescription);
    if (state === PainState.VALID) {
      // extract the coordinates from wordBody corresponding to origin and give them all an equal fraction of value as weight
      const wbCoordinates = extractWordBodyCoordinates(words, wordBody);
      for (const wbc of wbCoordinates) {
        painValues.push({ coordinate: wbc, weight: value / wbCoordinates.length });
      }
      // find the datapoint closest to the target pain value and extract its coordinate
      const dataPoint = await getClosestDataPoint(origin, value);
      try {
        const coor = extractCoordinate(dataPoint);
        logger.info(`Found closest datapoint for ${origin} @ ${JSON.stringify(coor)} with weight = ${value}`);
        painValues.push({ coordinate: coor, weight: value });
      }
      catch (error) {
        logger.info(`Error extracting the coordinate of ${origin} datapoint ${dataPoint.id}: ${JSON.stringify(error)}`);
      }
    }
  }
  // average the found points
  let userCoordinate: Coordinate = { lat: 0, lng: 0 };
  let weightSum = 0.0;
  for (const { coordinate, weight } of painValues) {
    userCoordinate.lat += weight * coordinate.lat;
    userCoordinate.lng += weight * coordinate.lng;
    weightSum += weight;
    logger.debug(`current intermediate coordinate = ${JSON.stringify(userCoordinate)} with weight = ${weightSum}`);
  }
  if (weightSum == 0) {
    weightSum = 1.0;
    // TODO: this shouldn't happen since we integrate wordBody coordinates and at least one word needs to be picked
    logger.warn(`Entered case with a 0 weightSum! painValues = ${JSON.stringify(painValues)}`);
  }
  const userLat = userCoordinate.lat / weightSum;
  const userLng = userCoordinate.lng / weightSum;
  userCoordinate = { lat: userLat, lng: userLng };
  logger.info(`Computed userCoordinate = ${JSON.stringify(userCoordinate)}`);
  return userCoordinate;
}

const SURVEY_WORD_CATEGORIES: Record<PainOrigin, string[]> = {
  [PainDbConfig.TN_EMO]: [
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
  [PainDbConfig.TN_ENV]: [
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
  [PainDbConfig.TN_SOCIOECO]: [
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
  [PainDbConfig.TN_PHYS]: [
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
