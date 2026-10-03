#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { strictAstInventory } from '../lib/strict-ast.mjs';
import { orderedUniqueAlignment } from '../lib/ordered-ast-alignment.mjs';
import { parseFlags, describeFile, assertDistinctFileOutput, sha256, BASELINE_BUNDLE_SHA256 } from '../lib/diagnostic-build-inputs.mjs';

const args = parseFlags(process.argv.slice(2), ['baseline-bundle', 'candidate-bundle', 'report']);
const tools = [import.meta.filename, '../lib/strict-ast.mjs', '../lib/ordered-ast-alignment.mjs', '../lib/diagnostic-build-inputs.mjs', '../node_modules/acorn/dist/acorn.mjs']
  .map((p, i) => i ? new URL(p, import.meta.url).pathname : p);
assertDistinctFileOutput(args.report, [args['baseline-bundle'], args['candidate-bundle'], ...tools]);
assert(!fs.existsSync(args.report), 'Preserve prior ordered AST diagnostics');
const inputs = { baseline: describeFile(args['baseline-bundle']), candidate: describeFile(args['candidate-bundle']) };
assert.equal(inputs.baseline.sha256, BASELINE_BUNDLE_SHA256);
function index(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  // Local exports and directive context belong to the complete validated module.
  // Never reparse a statement with a different surrounding syntax context.
  const inventory = strictAstInventory(source);
  const rows = inventory.statements.map(({ index, type, range, sha256, nodes }) => {
    const text = source.slice(...range);
    return { index, type, range, bytes: Buffer.byteLength(text),
      sha256, nodes: nodes - 1, preview: text.slice(0, 180) };
  });
  return rows;
}
const baseline = index(args['baseline-bundle']), candidate = index(args['candidate-bundle']);
const alignment = orderedUniqueAlignment(baseline.map(r => r.sha256), candidate.map(r => r.sha256));
for (const input of Object.values(inputs)) assert.equal(describeFile(input.path).sha256, input.sha256, 'Input changed while indexing');
const report = { kind: 'strict-ordered-top-level-statement-diagnostic', sourceEquivalenceEstablished: false,
  inputs, tools: tools.map(describeFile), baseline, candidate, alignment,
  criterion: 'Every complete statement is strictly hashed in its validated complete-Program context, preserving local export validity and directive context, with names, values, operators, kinds and internal order retained. Only normalizer-v2 positions and ordinary literal spellings are excluded.',
  limitations: ['Alignment does not rename, reorder, merge or split statements. Identical fragments found outside the monotonic sequence remain explicit out-of-order diagnostics.', 'This report diagnoses emitted JavaScript; source provenance, compiler reproduction and native runtime are separate obligations.'] };
const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
fs.mkdirSync(path.dirname(args.report), { recursive: true });
fs.writeFileSync(args.report, args.report.endsWith('.gz') ? gzipSync(bytes, { mtime: 0 }) : bytes);
console.log(JSON.stringify({ baselineStatements: baseline.length, candidateStatements: candidate.length,
  statementSequenceEqual: alignment.statementSequenceEqual, orderedUniqueAnchors: alignment.anchors.length,
  unmatchedIntervals: alignment.gaps.length, outOfOrderUniqueMatches: alignment.outOfOrderUniqueMatches.length,
  reportDecodedSha256: sha256(bytes) }));
