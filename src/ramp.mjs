/**
 * GP-1 ramp — progressive load / concurrency stage scheduling.
 * Parses ramp specs like "5:10s,20:30s,5:10s" and yields (concurrency, durationMs) pairs.
 */

/**
 * Parse a ramp string into stage objects.
 * Format: "conc:duration,conc:duration,..."
 * e.g. "5:10s,20:30s,5:10s" → [{concurrency:5, durationMs:10000},{concurrency:20, durationMs:30000},{concurrency:5, durationMs:10000}]
 * @param {string} spec
 * @returns {object[]}
 */
export function parseRamp(spec) {
  if (!spec || !spec.trim()) return [];
  const stages = spec.split(',').map(s => s.trim()).filter(Boolean);
  return stages.map((stage, i) => {
    const parts = stage.split(':');
    if (parts.length !== 2) throw new Error(`Invalid ramp stage '${stage}': expected "concurrency:duration" at position ${i + 1}`);
    const concurrency = parseInt(parts[0], 10);
    if (!Number.isFinite(concurrency) || concurrency < 1) throw new Error(`Invalid concurrency '${parts[0]}' in stage ${i + 1}: must be >= 1`);
    const durationMs = parseDuration(parts[1]);
    if (durationMs < 100) throw new Error(`Duration '${parts[1]}' in stage ${i + 1} too short: minimum 100ms`);
    return { concurrency, durationMs, stageIndex: i };
  });
}

/**
 * Parse a duration string like "10s", "500ms", "1.5m" into milliseconds.
 * @param {string} s
 * @returns {number}
 */
export function parseDuration(s) {
  const msMatch = s.match(/^([\d.]+)\s*ms$/i);
  if (msMatch) return parseFloat(msMatch[1]);
  const sMatch = s.match(/^([\d.]+)\s*s$/i);
  if (sMatch) return parseFloat(sMatch[1]) * 1000;
  const mMatch = s.match(/^([\d.]+)\s*m$/i);
  if (mMatch) return parseFloat(mMatch[1]) * 60000;
  const hMatch = s.match(/^([\d.]+)\s*h$/i);
  if (hMatch) return parseFloat(hMatch[1]) * 3600000;
  // bare number = seconds
  const bare = parseFloat(s);
  if (Number.isFinite(bare) && !isNaN(bare)) return bare * 1000;
  throw new Error(`Cannot parse duration: '${s}'`);
}

/**
 * Calculate the total duration of all ramp stages.
 * @param {object[]} stages
 * @returns {number} total ms
 */
export function totalRampDuration(stages) {
  return stages.reduce((sum, s) => sum + s.durationMs, 0);
}

/**
 * Given a list of ramp stages and an elapsed time, return the current target concurrency.
 * @param {object[]} stages
 * @param {number} elapsedMs
 * @returns {{ concurrency: number, stageIndex: number, stageProgress: number }}
 */
export function concurrencyAt(stages, elapsedMs) {
  let accumulated = 0;
  for (const stage of stages) {
    if (elapsedMs < accumulated + stage.durationMs) {
      const stageProgress = (elapsedMs - accumulated) / stage.durationMs;
      return {
        concurrency: stage.concurrency,
        stageIndex: stage.stageIndex,
        stageProgress
      };
    }
    accumulated += stage.durationMs;
  }
  // Past all stages: use last stage's concurrency
  const last = stages[stages.length - 1];
  return { concurrency: last.concurrency, stageIndex: stages.length - 1, stageProgress: 1 };
}
