import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('source archive validation adversarial controls', () => {
  const result=spawnSync('python3',[fileURLToPath(new URL('./materializer.test.py',import.meta.url))],{encoding:'utf8'});
  assert(!result.error,result.error?.message);assert.equal(result.status,0,result.stderr);
});
