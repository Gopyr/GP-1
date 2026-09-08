import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateHtml } from './html-report.mjs';

/**
 * Ensures gp1_output directory exists, calculates next sequential run number,
 * and writes both the JSON report and HTML report.
 * @param {object} report
 * @param {object} options
 */
export async function writeDefaultOutputs(report, options = {}) {
  const outputDir = join(process.cwd(), 'gp1_output');
  await mkdir(outputDir, { recursive: true });

  // Get next sequential index
  let index = 1;
  try {
    const files = await readdir(outputDir);
    const runIndices = files
      .map(f => {
        const m = f.match(/^run-(\d+)\.(json|html)$/);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter(x => x !== null);
    
    if (runIndices.length > 0) {
      index = Math.max(...runIndices) + 1;
    }
  } catch {
    // folder empty or error, default to index=1
  }

  const jsonFilename = `run-${index}.json`;
  const htmlFilename = `run-${index}.html`;

  const jsonPath = options.output || join(outputDir, jsonFilename);
  const htmlPath = options.htmlOutput || join(outputDir, htmlFilename);

  const jsonContent = JSON.stringify(report, null, 2) + '\n';
  const htmlContent = generateHtml(report);

  await Promise.all([
    writeFile(jsonPath, jsonContent),
    writeFile(htmlPath, htmlContent)
  ]);

  console.error(`\n[GP-1] Laporan otomatis disimpan:`);
  console.error(`  - JSON: gp1_output/${jsonFilename}`);
  console.error(`  - HTML: gp1_output/${htmlFilename}`);
}
