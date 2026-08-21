import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('mode=1 requires explicit lab confirmation', () => {
  const result = run(['--mode', '1', '--url', 'http://127.0.0.1:8123/health']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mode=1 requires --lab-confirm/);
});

test('mode=1 rejects non-private targets', () => {
  const result = run(['--mode', '1', '--lab-confirm', '--url', 'https://example.com']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /accepts localhost\/private targets only/);
});
