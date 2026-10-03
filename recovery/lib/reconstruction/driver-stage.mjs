import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
export function runStage(name, executable, args, options = {}) {
  const runner = options.runner ?? spawnSync;
  const env = { ...process.env }; for (const key of ['NODE_PATH','NODE_OPTIONS','BUN_OPTIONS']) delete env[key];
  const result = runner(executable, args, { encoding: 'utf8', env, maxBuffer: 4 * 1024 * 1024, cwd: options.cwd });
  assert(!result.error, `${name}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${name} failed (${result.signal ?? result.status}): ${(result.stderr ?? '').slice(-8192)}`);
  const value = JSON.parse(result.stdout);
  assert(value && typeof value === 'object' && !Array.isArray(value), `${name}: expected one JSON object`);
  return { name, executable, args, value, stderr: result.stderr, exitCode: result.status };
}
export function requireStageSuccess(stage) {
  assert.equal(stage.value.success, true, `${stage.name}: reported failure`);
  return stage;
}
