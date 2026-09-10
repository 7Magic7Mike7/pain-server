/*
 * File attribution
 * edited by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 * changes: +0 / -15 lines (excluding attribution)
 * baseline: 686059eea3cb (security before PR #12)
 */
// Copyright © 2026 Michael Artner
import { countryToCoordinate } from "./config/country-coordinate-config";
import { PAIN_ORIGINS, PainDbConfig, PainOrigin } from "./config/db-config";
import { getClosestDataPoint, PainData } from "./loader/db-loader";


const DECIMALS = 5;

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

enum PainState {
  VALID,
  EMPTY,
  ERROR,
};

/**
 * 
 * @param origin the layer we want to compute a pain value for
 * @param wordBubbles survey input, contains words corresponding to pain of certain layers
 * @param wordBody survey input, not used
 * @param temporality survey input, decides the maximum reachable pain
 * @param relations survey input, not used
 * @param painDescription survey input, not used
 * @returns a pain value in [0, 1] derived from the survey input, wordBubbles words belonging to origin, a flag stating whether the pain value is meaningful or not
 */
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
    return {
      value: Math.round(pain * maxPain * Math.pow(10, DECIMALS)) / Math.pow(10, DECIMALS),  // cut off everything after DECIMALS
      words: selectedOriginWords,
      state: (selectedOriginWords.length > 0) ? PainState.VALID : PainState.EMPTY,
    }
  }
  catch(error) {
    return {
      value: 0,
      words: selectedOriginWords,
      state: PainState.ERROR,
    }
  }
}

/**
 * 
 * @param selectedOriginWords selected words filtered by origin
 * @param wordBody coordinates where the selected word was placed on the globe during the survey
 * @returns list of coordinates of the selected words corresponding to a specific origin
 */
function extractWordBodyCoordinates(selectedOriginWords: string[], wordBody: WordBody[]): Coordinate[] {
  try {
    const coordinates: Coordinate[] = [];
    for (const wb of wordBody) {
      if (selectedOriginWords.includes(wb.word)) {
        coordinates.push({ lat: wb.lat, lng: wb.lng });
      }
    }
    return coordinates;
  }
  catch (error) {
    return [];
  }
}

/**
 * 
 * @param dataPoint PainData to extract a Coordinate from
 * @returns a Coordinate associated with the given dataPoint
 * @throws Error if dataPoint has neither a country nor a lat-lng pair, making coordinate extraction impossible
 */
function extractCoordinate(dataPoint: PainData): Coordinate {
  if (dataPoint.country) {
    const countryCoordiante = countryToCoordinate(dataPoint.country);
    if (countryCoordiante) {
      return countryCoordiante;
    }
    else {
      return { lat: 0, lng: 0};
    }
  }
  else if(dataPoint.lat && dataPoint.lng) {
    return { lat: dataPoint.lat, lng: dataPoint.lng };
  }
  throw new Error(`Invalid dataPoint: Neither country (=${dataPoint.country}) nor lat & lng (= ${dataPoint.lat}|${dataPoint.lng}) provided!`);
}

/**
 * 
 * @param wordBubbles survey input, contains words corresponding to pain of certain layers
 * @param wordBody survey input, contains coordinates for some of wordBubbles' words
 * @param temporality survey input, decides the maximum reachable pain
 * @param relations survey input, not used
 * @param painDescription survey input, not used
 * @returns 
 */
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
      try {
        const dataPoint = await getClosestDataPoint(origin, value);
        try {
          const coor = extractCoordinate(dataPoint);
          painValues.push({ coordinate: coor, weight: value });
        }
        catch (error) {
          // don't log as error since nothing breaks if this happens, the coordinate computation is just more inaccurate
        }
      }
      catch (error) {
        // don't log as error since nothing breaks if this happens, the coordinate computation is just more inaccurate
      }
    }
  }
  // average the found points
  const intermediateCoordinate: Coordinate = { lat: 0, lng: 0 };
  let weightSum = 0.0;
  for (const { coordinate, weight } of painValues) {
    intermediateCoordinate.lat += weight * coordinate.lat;
    intermediateCoordinate.lng += weight * coordinate.lng;
    weightSum += weight;
  }
  if (weightSum == 0) {
    weightSum = 1.0;
  }
  const userCoordinate = { lat: intermediateCoordinate.lat / weightSum, lng: intermediateCoordinate.lng / weightSum };
  return userCoordinate;
}
