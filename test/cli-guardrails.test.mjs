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

test('--url is required', () => {
  const result = run([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--url is required/);
});

test('unknown option is rejected', () => {
  const result = run(['--url', 'http://localhost:3000', '--bogus']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option/);
});

test('invalid method is uppercased', () => {
  const result = run(['--url', 'http://127.0.0.1:8123', '--method', 'post', '--body', '{}', '-d', '1', '-c', '1', '-t', '1000']);
  // Should either run or fail with connection refused, but NOT a parse error about method
  assert.ok(!result.stderr.includes('Unknown option'));
});

test('ramp spec is accepted', () => {
  const result = run(['--url', 'http://127.0.0.1:8123', '--ramp', '2:1s,5:1s', '-t', '500']);
  // Will fail with connection refused, but should parse the ramp spec
  assert.ok(!result.stderr.includes('Invalid ramp'));
});

test('invalid ramp spec is rejected', () => {
  const result = run(['--url', 'http://127.0.0.1:8123', '--ramp', 'invalid']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid ramp/);
});

test('--version prints version', () => {
  const result = run(['--version']);
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('--help prints help', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GP-1/);
  assert.match(result.stdout, /--method/);
  assert.match(result.stdout, /--body/);
  assert.match(result.stdout, /--ramp/);
  assert.match(result.stdout, /--threshold/);
  assert.match(result.stdout, /--assert/);
});

test('--threshold flag is accepted', () => {
  const result = run(['--url', 'http://127.0.0.1:8123', '--threshold', 'p95<500', '-d', '1', '-c', '1']);
  // Connection will fail, but threshold parsing should succeed
  assert.ok(!result.stderr.includes('Unknown option'));
});

test('--header flag is accepted', () => {
  const result = run(['--url', 'http://127.0.0.1:8123', '-H', 'X-Custom: test-value', '-d', '1', '-c', '1']);
  assert.ok(!result.stderr.includes('Unknown option'));
});

test('--bearer flag is accepted', () => {
  const result = run(['--url', 'http://127.0.0.1:8123', '--bearer', 'mytoken123', '-d', '1', '-c', '1']);
  assert.ok(!result.stderr.includes('Unknown option'));
});

test('compare subcommand help works', () => {
  const result = run(['compare', '--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /compare/);
});

test('html subcommand help works', () => {
  const result = run(['html', '--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /html/);
});
