export function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

export function summarize(samples, elapsedMs, config = {}) {
  const latencies = samples.map((sample) => sample.latencyMs).filter(Number.isFinite);
  const successful = samples.filter((sample) => sample.ok).length;
  const failed = samples.length - successful;
  const statusCodes = {};
  const errors = {};

  for (const sample of samples) {
    if (sample.status !== null) statusCodes[sample.status] = (statusCodes[sample.status] || 0) + 1;
    if (sample.error) errors[sample.error] = (errors[sample.error] || 0) + 1;
  }

  const safeElapsed = Math.max(elapsedMs, 1);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    config,
    totals: {
      requests: samples.length,
      successful,
      failed,
      successRate: samples.length ? successful / samples.length : 0,
      requestsPerSecond: (samples.length / safeElapsed) * 1000
    },
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : null,
      mean: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length ? Math.max(...latencies) : null
    },
    statusCodes,
    errors,
    elapsedMs
  };
}
