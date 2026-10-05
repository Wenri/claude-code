// Proposed portability-only boundary. No compiler or naming behavior lives here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function checkedRelative(value) {
  assert(typeof value === 'string' && value && !path.isAbsolute(value));
  assert(!/[\\\0\r\n]/u.test(value));
  assert(value.split('/').every(part => part && part !== '.' && part !== '..'));
  return value;
}
function rejectSymlinkAncestors(filename) {
  let cursor = path.resolve(filename);
  while (true) {
    assert(!fs.lstatSync(cursor).isSymbolicLink(), `Symlink is not an accepted tool root: ${cursor}`);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
export function resolvePinnedInput(roots, pin) {
  assert(pin && typeof pin === 'object' && Object.hasOwn(roots, pin.root), 'Unknown explicit root');
  assert(/^[0-9a-f]{64}$/.test(pin.sha256));
  assert(Number.isSafeInteger(pin.bytes) && pin.bytes >= 0);
  const root = roots[pin.root];
  assert(typeof root === 'string' && path.isAbsolute(root) && root === path.resolve(root));
  rejectSymlinkAncestors(root);
  assert(fs.lstatSync(root).isDirectory());
  const filename = path.join(root, checkedRelative(pin.path));
  assert(filename.startsWith(root + path.sep));
  rejectSymlinkAncestors(filename);
  const status = fs.lstatSync(filename);
  assert(status.isFile() && status.size === pin.bytes);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const hash = crypto.createHash('sha256'), chunk = Buffer.allocUnsafe(64 * 1024);
  let count = 0;
  try {
    const opened = fs.fstatSync(fd);
    assert(opened.dev === status.dev && opened.ino === status.ino && opened.size === pin.bytes);
    while (true) { const size = fs.readSync(fd, chunk, 0, chunk.length, null); if (!size) break; count += size; assert(count <= pin.bytes); hash.update(chunk.subarray(0, size)); }
  } finally { fs.closeSync(fd); }
  assert.equal(count, pin.bytes);
  assert.equal(hash.digest('hex'), pin.sha256, `Pinned input changed: ${pin.root}:${pin.path}`);
  return filename;
}
