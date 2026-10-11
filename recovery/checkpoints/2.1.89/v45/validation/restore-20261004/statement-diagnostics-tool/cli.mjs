import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(message); };
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
export function regular(file, maxBytes, unaliased = false, api = fs) {
  const absolute = path.resolve(file), st = api.lstatSync(absolute, { bigint: true });
  if (!st.isFile() || st.size > BigInt(maxBytes)) fail('not a bounded regular file');
  if (unaliased && api.realpathSync(absolute) !== absolute) fail('tool or output ancestor alias');
  // NONBLOCK prevents a regular-file-to-FIFO swap from blocking open. The
  // descriptor is checked again and closed on every post-open failure.
  const fd = api.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = api.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.size > BigInt(maxBytes) || !same(st, opened)) fail('file changed while opening');
    return { path: absolute, fd, initial: opened };
  } catch (error) { api.closeSync(fd); throw error; }
}
function bytes(file, maxBytes) {
  const st = fs.fstatSync(file.fd, { bigint: true });
  if (!same(st, file.initial) || st.size > BigInt(maxBytes)) fail('input changed or exceeds bound');
  const out = Buffer.alloc(Number(st.size));
  let offset = 0;
  while (offset < out.length) { const n = fs.readSync(file.fd, out, offset, out.length - offset, offset); if (!n) fail('truncated input'); offset += n; }
  if (fs.readSync(file.fd, Buffer.alloc(1), 0, 1, offset) !== 0) fail('input grew');
  if (!same(fs.fstatSync(file.fd, { bigint: true }), file.initial)) fail('input changed while reading');
  return out;
}
function hashFile(file, maxBytes) {
  const st = fs.fstatSync(file.fd, { bigint: true });
  if (!same(st, file.initial) || st.size > BigInt(maxBytes)) fail('tool changed or exceeds bound');
  const hash = crypto.createHash('sha256'), chunk = Buffer.alloc(65536); let pos = 0, n;
  while ((n = fs.readSync(file.fd, chunk, 0, chunk.length, pos))) { pos += n; if (pos > maxBytes) fail('tool exceeds bound'); hash.update(chunk.subarray(0, n)); }
  if (BigInt(pos) !== st.size || !same(fs.fstatSync(file.fd, { bigint: true }), file.initial)) fail('tool changed while hashing');
  return hash.digest('hex');
}
function pinTools(pinPath, expectedHash) {
  const f = regular(pinPath, 1024 * 1024, true);
  let text; try { text = bytes(f, 1024 * 1024); } finally { fs.closeSync(f.fd); }
  if (sha(text) !== expectedHash) fail('tool inventory hash mismatch');
  const pins = JSON.parse(text);
  if (pins.version !== 'statement-diagnostics-tool-closure-v1' || !Array.isArray(pins.files) || pins.files.length > 256) fail('invalid tool inventory');
  const seen = new Set();
  for (const row of pins.files) {
    if (Object.keys(row).sort().join() !== 'bytes,path,sha256' || typeof row.path !== 'string' || !path.isAbsolute(row.path) || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > 256 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(row.sha256) || seen.has(row.path)) fail('invalid tool inventory member');
    seen.add(row.path); const f = regular(row.path, row.bytes, true);
    try { if (Number(f.initial.size) !== row.bytes || hashFile(f, row.bytes) !== row.sha256) fail('tool hash mismatch'); } finally { fs.closeSync(f.fd); }
  }
  for (const required of [process.execPath, path.join(ROOT, 'cli.mjs'), path.join(ROOT, 'diagnostics.mjs'), path.resolve(ROOT, '../v12/validation/node_modules/acorn/dist/acorn.mjs'), path.resolve(ROOT, '../../claude-per-version-upstream/recovery/lib/ordered-ast-alignment.mjs')]) if (!seen.has(required)) fail('tool inventory omits required code');
}
async function main() {
  if (['NODE_OPTIONS', 'NODE_PATH', 'BUN_OPTIONS'].some(k => process.env[k])) fail('unclean startup environment');
  if (process.execArgv.some(a => !/^--max-old-space-size=\d+$/.test(a))) fail('unsupported Node startup option');
  const args = process.argv.slice(2), values = {};
  if (args.shift() !== 'inspect' || args.length % 2) fail('usage: inspect --input PATH --input-sha256 SHA --output PATH --tool-pins PATH --tool-pins-sha256 SHA [--max-nodes N] [--max-bytes N]');
  const allowed = new Set(['--input', '--input-sha256', '--output', '--tool-pins', '--tool-pins-sha256', '--max-nodes', '--max-bytes']);
  for (let i = 0; i < args.length; i += 2) { if (!allowed.has(args[i]) || values[args[i]] !== undefined) fail('unknown or repeated option'); values[args[i]] = args[i + 1]; }
  for (const k of ['--input', '--input-sha256', '--output', '--tool-pins', '--tool-pins-sha256']) if (!values[k]) fail('missing required option');
  for (const k of ['--input-sha256', '--tool-pins-sha256']) if (!/^[a-f0-9]{64}$/.test(values[k])) fail('invalid expected SHA256');
  const maxBytes = Number(values['--max-bytes'] ?? 33554432), maxNodes = Number(values['--max-nodes'] ?? 4000000);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 33554432 || !Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 8000000) fail('invalid budget');
  const output = path.resolve(values['--output']), parent = path.dirname(output);
  if (fs.realpathSync(parent) !== parent || !fs.statSync(parent).isDirectory()) fail('output directory alias');
  if (fs.existsSync(output) || fs.lstatSync(output, { throwIfNoEntry: false })) fail('refusing output overwrite');
  pinTools(values['--tool-pins'], values['--tool-pins-sha256']);
  const source = regular(values['--input'], maxBytes);
  try {
    const input = bytes(source, maxBytes);
    if (sha(input) !== values['--input-sha256']) fail('source hash mismatch');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    // Keep a UTF-8 BOM as source data so byte pinning and UTF-16 ranges agree.
    const decoded = input.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? '\uFEFF' + text : text;
    if (!Buffer.from(decoded).equals(input)) fail('noncanonical UTF-8');
    const { inspectSource } = await import(pathToFileURL(path.join(ROOT, 'diagnostics.mjs')).href);
    const inventory = inspectSource(decoded, { maxSourceBytes: maxBytes, maxNodes });
    const finalInput = bytes(source, maxBytes);
    if (sha(finalInput) !== values['--input-sha256'] || !same(fs.lstatSync(source.path, { bigint: true }), source.initial)) fail('source changed after inspection');
    pinTools(values['--tool-pins'], values['--tool-pins-sha256']);
    inventory.io = { sourcePath: source.path, sourceBeforeSha256: sha(input), sourceAfterSha256: sha(finalInput), toolInventorySha256: values['--tool-pins-sha256'], inputsExecuted: false };
    const data = Buffer.from(JSON.stringify(inventory) + '\n');
    if (data.length > 64 * 1024 * 1024) fail('output byte budget exceeded');
    const temporary = path.join(parent, '.statement-diagnostics-' + crypto.randomUUID() + '.tmp');
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try {
      try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const check = regular(temporary, data.length, true);
      try { if (hashFile(check, data.length) !== sha(data)) fail('temporary output audit failed'); } finally { fs.closeSync(check.fd); }
      // link is exclusive: a concurrent destination creator cannot be overwritten.
      fs.linkSync(temporary, output);
      const audit = regular(output, data.length, true);
      try { if (hashFile(audit, data.length) !== sha(data)) fail('output audit failed'); } finally { fs.closeSync(audit.fd); }
    } finally { fs.unlinkSync(temporary); }
    console.log(JSON.stringify({ output, bytes: data.length, sha256: sha(data), nodes: inventory.strictAst.nodes, statements: inventory.statements.length, diagnosticOnly: true }));
  } finally { fs.closeSync(source.fd); }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`statement diagnostics refused: ${String(error.message).slice(0, 700)}\n`); process.exitCode = 1; });
