/**
 * Calculate arithmetic mean of an array of numbers.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Calculate population standard deviation.
 */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Calculate Upper Control Limit (3-sigma).
 * UCL = mean + 3 * stdDev
 */
export function ucl3Sigma(values: number[]): number {
  return mean(values) + 3 * stdDev(values);
}

/**
 * Round to specified decimal places.
 */
export function round(value: number, decimals: number = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
