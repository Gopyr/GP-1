export function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

/**
 * Standard deviation of an array of numbers.
 */
function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squareDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squareDiffs.reduce((s, v) => s + v, 0) / (values.length - 1));
}

export function summarize(samples, elapsedMs, config = {}) {
  const latencies = samples.map((sample) => sample.latencyMs).filter(Number.isFinite);
  const successful = samples.filter((sample) => sample.ok).length;
  const failed = samples.length - successful;
  const bytesReceived = samples.reduce((sum, sample) => sum + (sample.bytesReceived || 0), 0);
  const statusCodes = {};
  const errors = {};
  const latencyBuckets = {};

  for (const sample of samples) {
    if (sample.status !== null) statusCodes[sample.status] = (statusCodes[sample.status] || 0) + 1;
    if (sample.error) errors[sample.error] = (errors[sample.error] || 0) + 1;
    // Latency distribution buckets (0-50, 50-100, 100-200, 200-500, 500-1000, 1000-5000, 5000+)
    const ms = sample.latencyMs;
    const bucket = ms < 50 ? '0-50' : ms < 100 ? '50-100' : ms < 200 ? '100-200' : ms < 500 ? '200-500' : ms < 1000 ? '500-1000' : ms < 5000 ? '1000-5000' : '5000+';
    latencyBuckets[bucket] = (latencyBuckets[bucket] || 0) + 1;
  }

  const safeElapsed = Math.max(elapsedMs, 1);
  const bytesPerSecond = (bytesReceived / safeElapsed) * 1000;
  const latenciesSorted = [...latencies].sort((a, b) => a - b);

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    config,
    totals: {
      requests: samples.length,
      successful,
      failed,
      successRate: samples.length ? successful / samples.length : 0,
      requestsPerSecond: (samples.length / safeElapsed) * 1000,
      bytesReceived,
      bytesPerSecond,
      mebibytesPerSecond: bytesPerSecond / (1024 * 1024),
      errorRate: samples.length ? failed / samples.length : 0
    },
    latencyMs: {
      min: latencies.length ? latenciesSorted[0] : null,
      mean: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
      stddev: stddev(latencies),
      p5: percentile(latencies, 5),
      p10: percentile(latencies, 10),
      p25: percentile(latencies, 25),
      p50: percentile(latencies, 50),
      p75: percentile(latencies, 75),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length ? latenciesSorted[latenciesSorted.length - 1] : null
    },
    latencyBuckets,
    statusCodes,
    errors,
    elapsedMs,
    connectionStats: {
      totalConnections: samples.filter(s => !s.error).length,
      failedConnections: samples.filter(s => s.error).length,
      avgLatencyMs: latencies.length ? latencies.reduce((s, v) => s + v, 0) / latencies.length : null,
      medianLatencyMs: percentile(latencies, 50)
    }
  };
}

/**
 * Format a report summary as a compact single-line string.
 */
export function formatSummaryLine(report) {
  const { totals, latencyMs } = report;
  return `GP-1 mode=${report.config.mode} ${report.config.profile} | ${totals.requests} req | ${totals.requestsPerSecond.toFixed(1)} r/s | p50 ${(latencyMs.p50 ?? 0).toFixed(1)}ms | p95 ${(latencyMs.p95 ?? 0).toFixed(1)}ms | p99 ${(latencyMs.p99 ?? 0).toFixed(1)}ms | ${(totals.mebibytesPerSecond ?? 0).toFixed(2)} MiB/s | err ${(totals.errorRate * 100).toFixed(1)}%`;
}
