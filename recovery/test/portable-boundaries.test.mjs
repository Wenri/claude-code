import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkedRelative, resolvePinnedInput } from '../lib/reconstruction/checked-roots.mjs';
import { runStage, requireStageSuccess } from '../lib/reconstruction/driver-stage.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
test('checked roots authenticate bytes and reject traversal, aliases, missing roots and drift', () => {
  const root = fs.mkdtempSync(path.join(here, '.tiny-root-')), source = 'bounded fixture\n';
  fs.writeFileSync(path.join(root, 'input'), source);
  const pin = { root: 'tools', path: 'input', bytes: Buffer.byteLength(source), sha256: crypto.createHash('sha256').update(source).digest('hex') };
  assert.equal(resolvePinnedInput({ tools: root }, pin), path.join(root, 'input'));
  for (const invalid of ['', '..', '.', '../input', '/input', 'a//b', 'a/./b', 'a/../b', 'a\\b', 'a\0b', 'a\nb']) assert.throws(() => checkedRelative(invalid));
  assert.throws(() => resolvePinnedInput({}, pin));
  assert.throws(() => resolvePinnedInput({ tools: root }, { ...pin, sha256: '0'.repeat(64) }));
  assert.throws(() => resolvePinnedInput({ tools: root }, { ...pin, bytes: pin.bytes + 1 }));
  fs.symlinkSync(path.join(root, 'input'), path.join(root, 'alias'));
  assert.throws(() => resolvePinnedInput({ tools: root }, { ...pin, path: 'alias' }));
});
test('driver stages remove NODE_PATH and preserve exact command argv', () => {
  let called = false;
  const prior = process.env.NODE_PATH; process.env.NODE_PATH = '/not-allowed';
  try {
    const stage = runStage('fixture', '/pinned/node', ['--arg', 'value'], { runner: (exe, argv, options) => {
      called = true; assert.equal(exe, '/pinned/node'); assert.deepEqual(argv, ['--arg', 'value']); assert(!Object.hasOwn(options.env, 'NODE_PATH'));
      return { status: 0, stdout: '{"success":true}', stderr: '' };
    } });
    requireStageSuccess(stage); assert(called);
  } finally { if (prior === undefined) delete process.env.NODE_PATH; else process.env.NODE_PATH = prior; }
});
test('driver stops on child failure, invalid JSON, signals or false success', () => {
  for (const result of [{ status: 2, stdout: '{}', stderr: 'failure' }, { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }, { status: 0, stdout: '[]', stderr: '' }, { status: 0, stdout: '{}\n{}', stderr: '' }, { error: new Error('spawn blocked') }])
    assert.throws(() => runStage('fixture', '/node', [], { runner: () => result }));
  assert.throws(() => requireStageSuccess({ name: 'fixture', value: { success: false } }));
});
