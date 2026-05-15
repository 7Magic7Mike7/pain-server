type CoordinateDataPoint = [number, number, number, string, string];


export function getRandomDataPoint(): CoordinateDataPoint {
  return [
    (Math.random() - 0.5) * 2 * Math.PI, // longitude
    (Math.random() - 0.5) * Math.PI, // latitude
    Math.random(), // pain_value
    ["fire", "water", "depression", "neck", "teeth"][Math.floor(Math.random() * 5)], // pain_type
    ["ADD", "UPDATE", "REMOVE"][Math.floor(Math.random() * 3)] // row_type
  ];
}
