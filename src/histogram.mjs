/**
 * GP-1 histogram — latency distribution buckets.
 * Creates fixed-width buckets for latency visualization.
 */

/**
 * Generate latency histogram buckets from samples.
 * @param {object[]} samples - array with latencyMs
 * @param {number} [bucketCount=20] - number of buckets
 * @returns {{ buckets: {min: number, max: number, count: number}[], maxCount: number, percentiles: object }}
 */
export function histogram(samples, bucketCount = 20) {
  const latencies = samples.map(s => s.latencyMs).filter(Number.isFinite);
  if (latencies.length === 0) return { buckets: [], maxCount: 0, percentiles: {} };

  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min || 1;
  const bucketWidth = range / bucketCount;

  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const bMin = min + i * bucketWidth;
    const bMax = i === bucketCount - 1 ? max + 0.001 : min + (i + 1) * bucketWidth;
    const count = latencies.filter(l => l >= bMin && l < bMax).length;
    buckets.push({ min: bMin, max: bMax, count });
  }

  const maxCount = Math.max(...buckets.map(b => b.count));

  // Compute detailed percentiles
  const percentiles = {};
  for (const p of [1, 5, 10, 25, 50, 75, 90, 95, 99]) {
    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    percentiles[`p${p}`] = lower === upper ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
  }

  return { buckets, maxCount, percentiles, min, max, count: latencies.length };
}

/**
 * Render histogram as ASCII bar chart for terminal output.
 * @param {object} hist - from histogram()
 * @param {number} [width=40] - max bar width in chars
 * @returns {string}
 */
export function renderHistogram(hist, width = 40) {
  if (!hist.buckets.length) return '  (no latency data)';
  const lines = [];
  const maxBarWidth = width;
  const maxCount = hist.maxCount || 1;
  
  for (const bucket of hist.buckets) {
    const barLen = Math.max(1, Math.round((bucket.count / maxCount) * maxBarWidth));
    const bar = '█'.repeat(barLen);
    const rangeStr = `${bucket.min.toFixed(0)}-${bucket.max.toFixed(0)}ms`.padStart(12);
    const countStr = String(bucket.count).padStart(4);
    lines.push(`  ${rangeStr} ${bar} ${countStr}`);
  }
  return lines.join('\n');
}

/**
 * Add histogram to a summary report object.
 * @param {object} report
 * @param {object[]} samples
 * @returns {object} mutated report
 */
export function enrichReportWithHistogram(report, samples) {
  report.histogram = histogram(samples);
  return report;
}
