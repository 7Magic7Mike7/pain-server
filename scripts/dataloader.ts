import fs from 'fs';
import path from 'path';

type CoordinateDataPoint = [number, number, number, string, string];

const BASE_PATH = path.join(__dirname, '..', '..', 'data'); // we need to go up two levels because of typescript to javascript conversion
const DATA_PATH_COUNTRY = path.join(BASE_PATH, 'EXAMPLE_env-fire-pain.csv');
const DATA_PATH_COORDINATE = path.join(BASE_PATH, 'EXAMPLE_coordinate-data.csv');

// env-fire-pain.csv from my data repository taken as example
const countryData: Record<string, number> = {};
// AI generated with the following prompt:
/* 
fill this csv file for me with 1000 random data points according to the following specification:
- ID... ascending integers starting at 1
- longitude... float in [-pi, +pi]
- latitude... float in [-pi/2, +pi/2]
- pain_value... float in [0, 1]
- pain_type... string in ["fire", "water", "depression", "neck", "teeth"]
- row_type... string in ["ADD", "UPDATE", "REMOVE"]
the values for longitude, latitude, pain_value and pain_type should be distributed uniformly, while row_type should have 90% "ADD" and 5% each for the other two values"
*/
const coordinateData: Record<number, CoordinateDataPoint> = {};

function _loadData(filePath: string): string[][] {
  // Implement as needed
  const parsedData = [];

  // load the data
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.trim().split('\n');
  
  // extract the data
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const values = lines[i].split(',');
    const row = [];
    for (let j = 0; j < values.length; j++) {
      row.push(values[j].trim());
    }
    parsedData.push(row);
  }

  return parsedData;
}

function _initializeCountryData(): void {
  console.log('Country data loaded from CSV:');
  
  // load the country data CSV file and parse it into data
  const rawData = _loadData(DATA_PATH_COUNTRY);
  
  // populate the country data
  for (const row of rawData) {
    const key: string = row[0].trim();
    const val: number = Number.parseFloat(row[1].trim());
    countryData[key] = val;
  }

  console.log(Object.entries(countryData).slice(0, 10)); // print only the first 10 entries for brevity
}

function _initializeCoordinateData(): void {
  console.log('Coordinate data loaded from CSV:');
  
  // load the coordinate data CSV file and parse it into data
  const rawData = _loadData(DATA_PATH_COORDINATE);
  
  // populate the coordinate data
  for (const row of rawData) {
    const key: number = Number.parseInt(row[0].trim(), 10);
    const val: CoordinateDataPoint = [
      Number.parseFloat(row[1].trim()),
      Number.parseFloat(row[2].trim()),
      Number.parseFloat(row[3].trim()),
      row[4].trim(),
      row[5].trim()
    ];
    coordinateData[key] = val;
  }
  
  console.log(Object.entries(coordinateData).slice(0, 10)); // print only the first 10 entries for brevity
}

function initializeData(): void {
  console.log('Initializing data...');
  _initializeCountryData();
  _initializeCoordinateData();
  console.log('Data initialization complete.');
}

function getCountryData(): Record<string, number> {
  return countryData;
}

function getCoordinateData(): Record<number, CoordinateDataPoint> {
  return coordinateData;
}

function getCoordinateDataAfterId(id: number): CoordinateDataPoint[] {
  // 1) find the first index after the given id

  // 2) return all the data points after that index
  const dataPoints: CoordinateDataPoint[] = [];
  return dataPoints;
}

function getRandomDataPoint(): CoordinateDataPoint {
  const keys = Object.keys(coordinateData);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return coordinateData[Number.parseInt(randomKey, 10)];
}

export { initializeData, getCountryData, getCoordinateData, getRandomDataPoint };
