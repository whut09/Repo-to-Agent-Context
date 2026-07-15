export interface DistributionSummary {
  samples: number;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  confidence95: { low: number; high: number } | null;
}

export function summarizeDistribution(values: Array<number | null | undefined>): DistributionSummary {
  const samples = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!samples.length) return { samples: 0, mean: null, median: null, standardDeviation: null, confidence95: null };
  const mean = average(samples);
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  const variance = samples.length > 1 ? samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1) : 0;
  const standardDeviation = Math.sqrt(variance);
  const margin = samples.length > 1 ? 1.96 * (standardDeviation / Math.sqrt(samples.length)) : 0;
  return {
    samples: samples.length,
    mean,
    median,
    standardDeviation,
    confidence95: { low: mean - margin, high: mean + margin }
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
