import { validateInquirerCoreCandidate, validateInquirerCoreAssembledClosure, validateInquirerCoreContext } from './inquirer-core-ownership.mjs';
import assert from 'node:assert/strict';
import { BASELINE_MAP_SHA256, safeRelative } from './diagnostic-build-inputs.mjs';

const candidates = new Map([
  ['@azure/core-rest-pipeline@1.21.0', 29],
  ['@azure/msal-common@15.13.1', 60],
  ['@typespec/ts-http-runtime@0.2.3', 40],
  ['@anthropic-ai/sdk@0.74.0', 51],
  ['@growthbook/growthbook@1.6.1', 6],
  ['tslib@2.8.1', 2],
  ['@azure/core-util@1.12.0', 4],
  ['@azure/core-client@1.9.4', 15],
  ['@azure/core-tracing@1.3.0', 6],
  ['@inquirer/prompts@6.0.1', 1],
  ['@anthropic-ai/foundry-sdk@0.2.3', 9],
  ['@anthropic-ai/mcpb@1.1.1', 11],
  ['diff@8.0.3', 7],
  ['eventsource-parser@3.0.2', 2],
  ['axios@1.13.6', 56],
  ['figures@6.1.0', 1],
  ['usehooks-ts@3.1.1', 1],
]);

// Authentication is inherited from the separately pinned offline acquisition
// report. Recheck all source identities and extracted bytes before compilation.
export function validateRuntimePackageCandidate(evidence, tree, mappedFiles) {
  if (evidence.package === '@inquirer/core' && evidence.candidateVersion === '9.2.1') {
    // The unchanged adapter calls with three arguments before assembly. Fail
    // closed until a reviewed adapter supplies its actual assembled input root.
    const assembledRoot = validateInquirerCoreContext(arguments[3]);
    const result = validateInquirerCoreCandidate(evidence, tree, mappedFiles);
    validateInquirerCoreAssembledClosure(evidence, tree, mappedFiles, assembledRoot);
    return { ...result, physicalOwnership: { ...result.physicalOwnership, assembledClosureValidated: true } };
  }
  assert.equal(evidence.kind, 'authenticated-all-mapped-runtime-supplement-candidate');
  const count = candidates.get(`${evidence.package}@${evidence.candidateVersion}`);
  assert(count, 'Unexpected runtime package candidate');
  assert.equal(evidence.provenance.sourceMap.sha256, BASELINE_MAP_SHA256);
  assert.equal(evidence.compatibleWithEveryMappedInput, true);
  assert.equal(evidence.status, 'authenticated-compatible-supplement-candidate');
  assert.equal(evidence.physicalPackageRoot, `node_modules/${evidence.package}`);
  assert(Array.isArray(evidence.registryVerification.verifiedSigningKeys) && evidence.registryVerification.verifiedSigningKeys.length > 0,
    'Candidate registry authentication missing');
  const prefix = `node_modules/${evidence.package}/`;
  const mapped = new Map(mappedFiles.map(file => [safeRelative(file.path), file]));
  assert.equal(mapped.size, mappedFiles.length, 'Duplicate mapped input');
  const owned = [...mapped.values()].filter(file => file.path.startsWith(prefix));
  assert.equal(owned.length, count, 'Unexpected mapped package input count');
  assert.equal(evidence.mappedComparisons.length, count);
  const compared = new Set();
  for (const row of evidence.mappedComparisons) {
    const relative = safeRelative(row.mappedPath);
    assert(relative.startsWith(prefix) && !compared.has(relative), 'Duplicate or foreign mapped comparison');
    compared.add(relative);
    const actual = mapped.get(relative);
    assert(actual && row.byteEqual === true && actual.bytes === row.baselineBytes &&
      actual.sha256 === row.baselineSha256 && row.candidateBytes === actual.bytes &&
      row.candidateSha256 === actual.sha256, `Mapped candidate comparison differs: ${relative}`);
  }
  const expected = new Map(evidence.files.map(file => [safeRelative(file.path), file]));
  assert.equal(expected.size, evidence.files.length, 'Duplicate extracted evidence path');
  assert.equal(tree.files.length, expected.size, 'Candidate inventory size differs');
  const seen = new Set();
  for (const file of tree.files) {
    const relative = safeRelative(file.path), pin = expected.get(relative);
    assert(relative.startsWith(prefix) && /\.(?:js|mjs|cjs|json)$/.test(relative), 'Foreign or unsupported runtime input');
    assert(!seen.has(relative) && !mapped.has(relative), 'Duplicate input or mapped replacement');
    seen.add(relative);
    assert(pin?.absentFromMappedInputs === true && pin.bytes === file.bytes && pin.sha256 === file.sha256,
      `Extracted candidate input differs: ${relative}`);
  }
  assert(expected.has(prefix + 'package.json'), 'Authenticated package metadata missing');
  return { package: evidence.package, version: evidence.candidateVersion, mappedInputs: count, supplementalFiles: tree.files.length };
}
