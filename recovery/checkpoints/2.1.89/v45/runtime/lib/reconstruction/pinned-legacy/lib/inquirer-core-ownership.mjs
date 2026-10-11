// Explicitly reviewed exception for this one archive and complete physical tree.
// Authentication remains in the pinned acquisition report; no new generic policy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { safeRelative, BASELINE_MAP_SHA256, inventoryTree } from './diagnostic-build-inputs.mjs';
export const INQUIRER_CORE_POLICY_SHA256 = '55ef71b12fd369c5c82bce6197da39c20c4e9b87b78cbeab478a8ac1f0e99e7e';
const root = 'node_modules/@inquirer/core', prefix = root + '/';
const identity = file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 });
const sorted = rows => [...rows].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const component = value => /^[a-z0-9][a-z0-9._-]*$/.test(value) && value !== 'node_modules';

// Accept a plain Object.prototype or null-prototype record only. Frozen data
// records are fine; accessors, proxies, symbols and hidden/extra keys are not.
export function validateInquirerCoreContext(context) {
  const message = 'Core candidate requires an assembled physical-closure gate with exact own plain-data context';
  assert(context !== null && typeof context === 'object' && !types.isProxy(context), message);
  const prototype = Object.getPrototypeOf(context);
  assert(prototype === Object.prototype || prototype === null, message);
  assert.deepEqual(Reflect.ownKeys(context), ['assembledRoot'], message);
  const descriptor = Object.getOwnPropertyDescriptor(context, 'assembledRoot');
  assert(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true &&
    typeof descriptor.value === 'string' && descriptor.value.length > 0, message);
  return descriptor.value;
}

function assertNoSymlinkAncestors(filename, finalIsDirectory) {
  // Require one unambiguous absolute spelling. Do not normalize away an input
  // symlink/.. traversal and then accidentally inspect a different directory.
  assert(typeof filename === 'string' && path.isAbsolute(filename) && path.resolve(filename) === filename,
    'Assembled physical path must be absolute and canonical');
  const ancestors = [];
  for (let current = filename; ; current = path.dirname(current)) {
    ancestors.push(current);
    if (path.dirname(current) === current) break;
  }
  for (const current of ancestors.reverse()) {
    const status = fs.lstatSync(current);
    assert(!status.isSymbolicLink(), 'Symlink physical ancestor is not accepted: ' + current);
    assert(current === filename && !finalIsDirectory ? status.isFile() : status.isDirectory(),
      'Nonregular physical ancestor or input: ' + current);
  }
}

export function physicalPackageOwner(filename) {
  safeRelative(filename);
  assert(!/[\x00-\x1f\x7f]/.test(filename), 'Noncanonical physical package path');
  const parts = filename.split('/');
  assert.equal(parts[0], 'node_modules', 'Physical owner path is not under node_modules');
  let ownerEnd = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== 'node_modules') continue;
    let end = i + 1;
    if (parts[end]?.startsWith('@')) {
      assert(component(parts[end].slice(1)), 'Malformed package scope');
      end++;
    }
    assert(typeof parts[end] === 'string' && component(parts[end]), 'Malformed package name');
    assert(end + 1 < parts.length, 'Physical owner path has no file below its package root');
    ownerEnd = end;
    i = end;
  }
  return parts.slice(0, ownerEnd + 1).join('/');
}

export function inquirerCorePolicy() {
  const bytes = fs.readFileSync(new URL('../audits/2026-10-03/source-reconstruction/inquirer-core-9.2.1-physical-owner-policy.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), INQUIRER_CORE_POLICY_SHA256, 'Core physical-owner policy differs');
  return JSON.parse(bytes);
}
function exactRows(actual, expected, message) {
  assert(Array.isArray(actual), message);
  for (const row of actual) {
    safeRelative(row.path);
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && /^[a-f0-9]{64}$/.test(row.sha256), message);
  }
  assert.equal(new Set(actual.map(row => row.path)).size, actual.length, 'Duplicate ' + message);
  assert.deepEqual(sorted(actual.map(identity)), sorted(expected.map(identity)), message);
}
function partitionPins() {
  const policy = inquirerCorePolicy();
const mappedPins = policy.physicalFiles.filter(row => row.mapped);
const rootPins = mappedPins.filter(row => row.physicalPackageOwner === root);
const nestedPins = mappedPins.filter(row => row.physicalPackageOwner !== root);
const retainedPins = policy.physicalFiles.filter(row => row.physicalPackageOwner !== root);
assert.equal(policy.package, '@inquirer/core'); assert.equal(policy.version, '9.2.1');
assert.equal(policy.sourceMapSha256, BASELINE_MAP_SHA256);
for (const pin of policy.physicalFiles) assert.equal(physicalPackageOwner(pin.path), pin.physicalPackageOwner, 'Misclassified policy file');
assert.equal(mappedPins.length, 26); assert.equal(rootPins.length, 20); assert.equal(nestedPins.length, 6); assert.equal(retainedPins.length, 12);
assert.equal(new Set(nestedPins.map(row => row.physicalPackageOwner)).size, 6);

  return { policy, mappedPins, rootPins, nestedPins, retainedPins };
}

export function validateInquirerCoreCandidate(evidence, tree, mappedFiles) {
  const { policy, mappedPins, rootPins, nestedPins, retainedPins } = partitionPins();
  assert.equal(evidence.kind, 'authenticated-all-mapped-runtime-supplement-candidate');
  assert.equal(evidence.package, '@inquirer/core'); assert.equal(evidence.candidateVersion, '9.2.1');
  assert.equal(evidence.physicalPackageRoot, root);
  assert.equal(evidence.provenance.sourceMap.sha256, BASELINE_MAP_SHA256);
  assert.equal(evidence.provenance.candidateInventory.sha256, policy.pinnedCandidateInventorySha256);
  for (const [name, pin] of Object.entries(policy.evidenceFiles)) {
    assert.equal(evidence.provenance[name]?.sha256, pin.sha256, 'Retained acquisition evidence differs');
    assert.equal(evidence.provenance[name]?.bytes, pin.bytes, 'Retained acquisition evidence size differs');
  }
  assert.equal(evidence.compatibleWithEveryMappedInput, true);
  assert.equal(evidence.status, 'authenticated-compatible-supplement-candidate');
  assert(Array.isArray(evidence.registryVerification.verifiedSigningKeys) && evidence.registryVerification.verifiedSigningKeys.length > 0, 'Candidate registry authentication missing');
  assert.equal(evidence.physicalOwnership?.policySha256, INQUIRER_CORE_POLICY_SHA256);
  assert.equal(evidence.physicalOwnership.kind, 'complete-physical-owner-partition');
  assert.equal(evidence.physicalOwnership.assembledClosureValidationRequiredBeforeCompilation, true);
  assert.deepEqual(evidence.physicalOwnership.counts, policy.counts);
  assert.deepEqual(evidence.physicalOwnership.mappedRows, mappedPins, 'Complete mapped owner partition differs');
  assert.deepEqual(evidence.physicalOwnership.retainedNestedPhysicalRows, retainedPins, 'Retained nested physical pins differ');
  const allMapped = new Map(mappedFiles.map(file => [safeRelative(file.path), file]));
  assert.equal(allMapped.size, mappedFiles.length, 'Duplicate mapped input');
  const underPrefix = mappedFiles.filter(file => file.path.startsWith(prefix));
  exactRows(underPrefix, mappedPins, 'Complete 26-path mapped physical package inventory differs');
  for (const file of underPrefix) assert.equal(physicalPackageOwner(file.path), mappedPins.find(pin => pin.path === file.path).physicalPackageOwner, 'Misclassified mapped physical owner');
  assert.equal(evidence.mappedComparisons.length, 26, 'Full-prefix comparison count differs');
  const seenComparisons = new Set();
  for (const row of evidence.mappedComparisons) {
    const target = safeRelative(row.mappedPath), pin = mappedPins.find(file => file.path === target);
    assert(pin && !seenComparisons.has(target), 'Duplicate or foreign mapped comparison'); seenComparisons.add(target);
    assert.equal(row.physicalPackageOwner, physicalPackageOwner(target), 'Comparison physical owner differs');
    assert.equal(row.path, target.slice(prefix.length), 'Comparison relative path differs');
    assert.equal(row.baselineBytes, pin.bytes); assert.equal(row.baselineSha256, pin.sha256);
    if (pin.physicalPackageOwner === root) {
      assert.equal(row.comparisonKind, 'authenticated-root-archive');
      assert.equal(row.tarMember, 'package/' + row.path);
      assert.equal(row.byteEqual, true); assert.equal(row.status, 'byte-equal');
      assert.equal(row.candidateBytes, pin.bytes); assert.equal(row.candidateSha256, pin.sha256);
    } else {
      assert.equal(row.comparisonKind, 'retained-nested-physical-input');
      assert.equal(row.status, 'retained-byte-equal'); assert.equal(row.retainedByteEqual, true);
      assert.equal(row.retainedBytes, pin.bytes); assert.equal(row.retainedSha256, pin.sha256);
      for (const field of ['tarMember', 'byteEqual', 'candidateBytes', 'candidateSha256']) assert.equal(row[field], null, 'Nested bytes must not be attributed to root archive');
    }
  }
  assert.deepEqual(evidence.counts, { mappedInputs: 26, byteEqual: 20, retainedByteEqual: 6, mismatched: 0, extraFilesExtracted: evidence.files.length });
  const expected = evidence.files;
  exactRows(expected, policy.rootSupplementalFiles, 'Authenticated root supplemental pins differ');
  exactRows(tree.files, expected, 'Candidate inventory differs');
  for (const file of expected) {
    const target = safeRelative(file.path);
    assert.equal(physicalPackageOwner(target), root, 'Nested or foreign supplemental owner');
    assert(target.startsWith(prefix) && /\.(?:js|mjs|cjs|json)$/.test(target), 'Unsupported runtime input');
    assert(!allMapped.has(target), 'Mapped replacement');
    assert.equal(file.absentFromMappedInputs, true); assert.equal(file.absentFromExtractedMappedTree, true);
    assert.equal(file.tarMember, 'package/' + target.slice(prefix.length));
  }
  assert(expected.some(file => file.path === prefix + 'package.json'), 'Authenticated package metadata missing');
  return { package: evidence.package, version: evidence.candidateVersion, mappedInputs: 26, supplementalFiles: tree.files.length,
    physicalOwnership: { rootOwnedMappedInputs: 20, retainedNestedMappedInputs: 6, policySha256: INQUIRER_CORE_POLICY_SHA256,
      assembledClosureValidationRequiredBeforeCompilation: true } };
}

// Mandatory gate for a future assembly integration. This scratch patch does not
// call it from the build adapter or authorize a candidate profile/build.
export function validateInquirerCoreAssembledClosure(evidence, candidateTree, mappedFiles, assembledRoot) {
  validateInquirerCoreCandidate(evidence, candidateTree, mappedFiles);
  const { rootPins, retainedPins } = partitionPins();
  assertNoSymlinkAncestors(assembledRoot, true);
  const expected = [...rootPins, ...retainedPins, ...evidence.files];
  // All authorized file paths are known before enumeration. Check every one of
  // their ancestors before inventoryTree can follow a directory or read bytes.
  for (const file of expected) assertNoSymlinkAncestors(path.join(assembledRoot, safeRelative(file.path)), false);
  const actual = inventoryTree(assembledRoot).files.filter(file => file.path.startsWith(prefix));
  exactRows(actual, expected, 'Assembled core physical closure differs');
  for (const file of actual) {
    physicalPackageOwner(file.path);
    assertNoSymlinkAncestors(path.join(assembledRoot, file.path), false);
  }
  return { mappedInputs: 26, retainedNestedOwners: 6, retainedNestedPhysicalFiles: 12, totalPhysicalFiles: expected.length };
}
