import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const verifierPath = fileURLToPath(import.meta.url);
const verifierDirectory = path.dirname(verifierPath);
const [workArg, outArg, pinArg, expectedPinSHA] = process.argv.slice(2);
assert(workArg && outArg && pinArg && /^[0-9a-f]{64}$/.test(expectedPinSHA), 'four explicit arguments required');
const work = path.resolve(workArg), out = path.resolve(outArg), pinFile = path.resolve(pinArg);
const base = path.join(work, 'source-batch-v45-diagnostic');
const stage = path.join(work, 'v45-source-batch');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
function regular(p) {
  assert.equal(fs.realpathSync(p), p, 'canonical path required');
  assert(fs.lstatSync(p).isFile(), 'regular file required');
  assert(fs.statSync(p).size <= 128*1024*1024, 'bounded file');
  const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const first = fs.fstatSync(fd); assert(first.isFile() && first.size <= 128*1024*1024);
    const data = fs.readFileSync(fd); const last = fs.fstatSync(fd);
    for (const key of ['dev','ino','size','mtimeMs','ctimeMs']) assert.equal(last[key],first[key]);
    assert.equal(data.length, first.size);
    const again = fs.lstatSync(p); assert(again.isFile());
    for (const key of ['dev','ino','size','mtimeMs','ctimeMs']) assert.equal(again[key],first[key]);
    return data;
  } finally { fs.closeSync(fd); }
}
assert.equal(fs.realpathSync(work),work); assert.equal(fs.realpathSync(path.dirname(out)),path.dirname(out));
assert(!fs.existsSync(out)); assert(out !== base && !out.startsWith(base+path.sep)); assert(out !== stage && !out.startsWith(stage+path.sep));
const pinBytes=regular(pinFile); assert.equal(hash(pinBytes),expectedPinSHA);
const pinDocument=JSON.parse(pinBytes); assert.equal(pinDocument.kind,'fresh-public-map-verification-inputs-v1');
const required=['final/cli.js','final/cli.js.map','named/cli.js','named/cli.js.map','identifier-edits.json','name-emission-report.json','profile.json','compiler-receipts.json'];
assert.deepEqual(Object.keys(pinDocument.inputs).sort(),required.sort());
const expected=Object.fromEntries(required.map(p=>[p,pinDocument.inputs[p].sha256]));
const oraclePins={'independent-oracle.mjs':'bf84647dd7f32dffe087960bf56734e9d9e66cb8c97fd32916c164dc29d912d1'};
const verifierSHA256=hash(regular(verifierPath));
function authenticate() {
  assert.equal(hash(regular(pinFile)),expectedPinSHA);
  for(const [name,sha] of Object.entries(oraclePins)) assert.equal(hash(regular(path.join(verifierDirectory,name))),sha);
  const inputs=required.map(relative=>{const p=path.join(base,relative),bytes=regular(p),pin=pinDocument.inputs[relative];assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256);return {path:p,bytes:bytes.length,sha256:pin.sha256};});
  return {inputs,oraclePins};
}
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const before = authenticate();
fs.mkdirSync(out,{mode:0o700});
write('input-preflight.json', { kind: 'actual-v45-map-authentication', ...before });
const { validateAll, independentReader, independentDecode, independentEncode } = await import('./independent-oracle.mjs');
function checkedInput(relative) { assert(required.includes(relative)); const bytes=regular(path.join(base,relative)); const pin=pinDocument.inputs[relative]; assert.equal(bytes.length,pin.bytes); assert.equal(hash(bytes),pin.sha256); return bytes; }
const codeBytes = checkedInput('final/cli.js');
const namedBytes = checkedInput('named/cli.js');
const code = codeBytes.toString('utf8'), renamedCode = namedBytes.toString('utf8');
assert(codeBytes.equals(Buffer.from(code)), 'valid reversible input UTF-8');
assert(namedBytes.equals(Buffer.from(renamedCode)), 'valid reversible output UTF-8');
assert(!/[\r\u2028\u2029]/u.test(code + renamedCode), 'LF-only supported separators');
const map = JSON.parse(checkedInput('final/cli.js.map'));
const outputMap = JSON.parse(checkedInput('named/cli.js.map'));
const lineage = JSON.parse(checkedInput('identifier-edits.json'));
const report = JSON.parse(checkedInput('name-emission-report.json'));
const profile = JSON.parse(checkedInput('profile.json'));
const receipts = JSON.parse(checkedInput('compiler-receipts.json'));
assert.equal(expected['profile.json'],'4001b061fbbe002c516af835ba9d5c0c97b15666eed9ba0cee99e4ace6e21120');
assert.equal(report.profileSha256, expected['profile.json']);
assert.equal(receipts.profileSha256, expected['profile.json']);
assert.equal(lineage.kind, 'identifier-only-emission-token-lineage');
assert.equal(lineage.coordinateConvention, 'UTF-16 offsets into authenticated pre-naming code');
assert.equal(lineage.inputSha256, expected['final/cli.js']);
assert.equal(lineage.outputSha256, expected['named/cli.js']);
assert.equal(lineage.recipeSha256, report.recipeSha256);
assert.equal(report.success, true);
assert.equal(report.emittedPhysicalIdentifierEdits, lineage.edits.length);
assert.deepEqual(report.outputs.map(x=>x.path).sort(),['named/cli.js','named/cli.js.map']);
for (const entry of report.outputs) {
  assert.equal(entry.sha256, expected[entry.path]);
  assert.equal(entry.bytes, checkedInput(entry.path).length);
}
assert.equal(report.outputs.length, 2);
assert.equal(report.editLineage.path, 'identifier-edits.json');
assert.equal(report.editLineage.sha256, expected['identifier-edits.json']);
assert.equal(report.editLineage.bytes, checkedInput('identifier-edits.json').length);
const edits = lineage.edits;
assert.equal(edits.length, 217569);
function reconstruct(rows, expectedBytes = namedBytes) {
  let last = 0, parts = [];
  for (const e of rows) {
    assert(Number.isSafeInteger(e.start) && Number.isSafeInteger(e.end) && last <= e.start && e.start < e.end && e.end <= code.length, 'ordered bounded nonoverlapping UTF-16 edit');
    assert.equal(code.slice(e.start, e.end), e.old, 'old identifier slice');
    assert(typeof e.replacement === 'string' && e.replacement.length > 0 && !/[\r\n\u2028\u2029]/u.test(e.old + e.replacement), 'nonempty same-line edit');
    assert(/^#?[A-Za-z_$][A-Za-z0-9_$]*$/u.test(e.old) && /^#?[A-Za-z_$][A-Za-z0-9_$]*$/u.test(e.replacement), 'actual edit strings are ASCII identifier or private-name spellings');
    assert.equal(e.old.startsWith('#'), e.replacement.startsWith('#'), 'private-name prefix preserved');
    assert(Array.isArray(e.roles) && e.roles.length > 0 && e.roles.every(x => typeof x === 'string'), 'recorded role strings');
    parts.push(code.slice(last, e.start), e.replacement);
    last = e.end;
  }
  parts.push(code.slice(last));
  const reconstructed = parts.join('');
  assert.equal(reconstructed, expectedBytes.toString('utf8'), 'complete UTF-16 reconstruction');
  assert(Buffer.from(reconstructed).equals(expectedBytes), 'complete UTF-8 reconstruction');
  return { edits: rows.length, utf16Length: reconstructed.length, bytes: expectedBytes.length, sha256: hash(expectedBytes) };
}
const reconstruction = reconstruct(edits);
let shrinking = 0, growing = 0, sameLength = 0, oldUnits = 0, replacementUnits = 0;
for (const e of edits) {
  oldUnits += e.old.length; replacementUnits += e.replacement.length;
  if (e.old.length > e.replacement.length) shrinking++;
  else if (e.old.length < e.replacement.length) growing++;
  else sameLength++;
}
function validateEveryMapping(m, text) {
  for (const property of ['file', 'sourceRoot']) if (property in m) assert.equal(typeof m[property], 'string');
  const reader = independentReader(m, text);
  assert(reader.lineCount <= text.split('\n').length, 'map encoded line count within generated file');
  let count = 0;
  for (let line = 0; line < reader.lineCount; line++) count += reader.read(line).length;
  return { segments: count, encodedLines: reader.lineCount };
}
const inputMapValidity = validateEveryMapping(map, code);
const outputMapValidity = validateEveryMapping(outputMap, renamedCode);
const removed = [];
const started = Date.now();
const verification = validateAll({ map, outputMap, code, renamedCode, edits, visitInterior: row => removed.push(row) });
const verificationMs = Date.now() - started;
assert.equal(verification.originalMappings, inputMapValidity.segments);
assert.equal(verification.retainedOriginalMappings + verification.insertedBoundaryMappings, outputMapValidity.segments);
assert.equal(verification.editStartsChecked, edits.length);
assert.equal(verification.editEndsChecked, edits.length);
assert.equal(report.mappingComposition.edits, edits.length);
assert.equal(report.mappingComposition.keptOriginalSegments, verification.retainedOriginalMappings);
assert.equal(report.mappingComposition.droppedChangedIdentifierInteriorSegments, verification.droppedInteriorMappings);
assert.equal(report.mappingComposition.insertedIdentifierBoundarySegments, verification.insertedBoundaryMappings);
const meta = m => { const value = { ...m }; delete value.mappings; return value; };
assert.deepEqual(meta(map), meta(outputMap));
assert.equal(path.dirname(path.resolve(`${base}/final`)), path.dirname(path.resolve(`${base}/named`)));
assert.equal(path.basename(path.resolve(`${base}/final`)), 'final');
assert.equal(path.basename(path.resolve(`${base}/named`)), 'named');
function sourceResolution(m, mapPath, source) {
  assert(!/^[a-z][a-z0-9+.-]*:/iu.test(source) && !path.isAbsolute(source), 'local relative source identity');
  assert.equal(m.sourceRoot, undefined, 'actual map has no sourceRoot');
  return path.resolve(path.dirname(mapPath), source);
}
const sourceRows = [];
for (let i = 0; i < map.sources.length; i++) {
  const source = map.sources[i];
  const finalTarget = sourceResolution(map, `${base}/final/cli.js.map`, source);
  const namedTarget = sourceResolution(outputMap, `${base}/named/cli.js.map`, outputMap.sources[i]);
  assert.equal(finalTarget, namedTarget, 'sibling placement preserves source identity ' + i);
  const withinV45InputTree = finalTarget.startsWith(path.join(stage,'inputs') + path.sep);
  const exists = withinV45InputTree && fs.existsSync(finalTarget);
  const disk = exists ? regular(finalTarget) : null;
  const embedded = map.sourcesContent[i];
  assert.equal(typeof embedded, 'string', 'actual source contents are embedded strings');
  const matches = disk ? disk.equals(Buffer.from(embedded)) : null;
  sourceRows.push({ index: i, source, resolvedPath: path.relative(process.cwd(), finalTarget), withinV45InputTree, readFromPhysicalStage: exists, realPath: exists ? path.relative(process.cwd(), fs.realpathSync(finalTarget)) : null, diskBytes: disk?.length ?? null, diskSha256: disk ? hash(disk) : null, embeddedBytes: Buffer.byteLength(embedded), embeddedSha256: hash(embedded), diskMatchesEmbedded: matches });
}
const distinctSourceTargets = new Set(sourceRows.map(x => x.resolvedPath)).size;
const contentDifferences = sourceRows.filter(x => x.diskMatchesEmbedded === false);
const missingSources = sourceRows.filter(x => !x.readFromPhysicalStage);
const declaredVirtuals = [...profile.virtualNativeWrappers, ...profile.virtualGrpcPaths];
const allVirtualReceipts = [...receipts.virtualNativeWrapperRequests, ...receipts.virtualGrpcRequests];
const virtualSourceIdentities = [];
for (const source of missingSources) {
  const matching = declaredVirtuals.filter(x => path.resolve(x.virtualAbsolutePath) === path.resolve(source.resolvedPath));
  assert.equal(matching.length, 1, 'missing historical path uniquely declared virtual');
  const declaration = matching[0];
  const stagedPath = path.join(stage,'inputs', declaration.sourceRelative);
  const staged = regular(stagedPath);
  assert.equal(hash(staged), source.embeddedSha256, 'virtual embedded bytes equal staged source');
  assert.equal(staged.length, source.embeddedBytes);
  const sourcePin = profile.sourceFiles.filter(x => x.path === declaration.sourceRelative);
  assert.equal(sourcePin.length, 1);
  assert.equal(sourcePin[0].sha256, hash(staged));
  assert.equal(sourcePin[0].bytes, staged.length);
  const loads = allVirtualReceipts.filter(x => x.hook === 'onLoad' && x.path === declaration.virtualAbsolutePath);
  const resolves = allVirtualReceipts.filter(x => x.hook === 'onResolve' && (x.virtualAbsolutePath === declaration.virtualAbsolutePath || (x.action === 'canonical-virtual-parent' && x.resolvedPath === declaration.virtualAbsolutePath)));
  assert(resolves.length > 0, 'virtual source has authenticated onResolve receipt');
  for (const r of resolves) {
    assert.equal(r.accepted, true);
    if (r.action === 'canonical-virtual-parent') {
      assert.equal(r.recordedTarget, declaration.sourceRelative);
      assert.equal(r.targetSha256, hash(staged));
    } else {
      assert.equal(r.sourceRelative, declaration.sourceRelative);
      assert.equal(r.sourceSha256, hash(staged));
    }
  }
  if (profile.virtualNativeWrappers.includes(declaration)) assert.equal(loads.length, 1, 'native wrapper uniquely recorded onLoad');
  for (const r of loads) {
    assert.equal(r.accepted, true);
    assert.equal(r.sourceRelative, declaration.sourceRelative);
    assert.equal(r.sourceSha256, hash(staged));
    assert.equal(r.sourceBytes, staged.length);
  }
  virtualSourceIdentities.push({ sourceIndex: source.index, historicalResolvedPath: path.resolve(source.resolvedPath), historicalPathRead: false, declaration, stagedPath, stagedBytes: staged.length, stagedSha256: hash(staged), embeddedBytesEqualStaged: true, profileSourcePin: sourcePin[0], onLoadReceipts: loads, onResolveReceipts: resolves });
}
assert.equal(virtualSourceIdentities.length, 4);
const footer = text => text.split('\n').filter(line => /^\/\/# (?:debugId|sourceMappingURL)=/u.test(line));
assert.deepEqual(footer(code), footer(renamedCode));
assert(footer(renamedCode).includes('//# debugId=' + outputMap.debugId));
const controls = [];
function rejected(name, action) {
  let failure;
  try { action(); } catch (error) { failure = error; }
  assert(failure, 'negative control did not reject: ' + name);
  controls.push({ name, rejected: true, error: failure.message.split('\n')[0] });
}
function verifyMutated(m) { return validateAll({ map, outputMap: m, code, renamedCode, edits }); }
const firstComma = outputMap.mappings.indexOf(',');
const firstFields = independentDecode(outputMap.mappings.slice(0, firstComma));
let mappedStart = 0, mappedEnd = firstComma, mappedFields = firstFields;
while (mappedFields.length === 1) {
  mappedStart = mappedEnd + 1;
  mappedEnd = outputMap.mappings.indexOf(',', mappedStart);
  assert(mappedEnd > mappedStart);
  mappedFields = independentDecode(outputMap.mappings.slice(mappedStart, mappedEnd));
}
assert.equal(mappedFields.length, 4);
const changedOriginal = [...mappedFields]; changedOriginal[3]++;
rejected('actual output first source-bearing mapping original column changed by +1', () => verifyMutated({ ...outputMap, mappings: outputMap.mappings.slice(0, mappedStart) + independentEncode(changedOriginal) + outputMap.mappings.slice(mappedEnd) }));
const changedGenerated = [...firstFields]; changedGenerated[0]++;
rejected('actual output first mapping generated column changed by +1', () => verifyMutated({ ...outputMap, mappings: independentEncode(changedGenerated) + outputMap.mappings.slice(firstComma) }));
rejected('actual output first inserted boundary mapping deleted', () => verifyMutated({ ...outputMap, mappings: outputMap.mappings.slice(firstComma + 1) }));
const secondComma = outputMap.mappings.indexOf(',', firstComma + 1);
const secondFields = independentDecode(outputMap.mappings.slice(firstComma + 1, secondComma));
assert.equal(firstFields.length, 1);
assert.equal(secondFields.length, 1);
secondFields[0] += firstFields[0];
rejected('actual redundant unmapped boundary removed with every downstream column preserved', () => verifyMutated({ ...outputMap, mappings: independentEncode(secondFields) + outputMap.mappings.slice(secondComma) }));
const changedSources = [...outputMap.sources]; changedSources[0] = '../../wrong-source.js';
rejected('actual output one source identity changed', () => verifyMutated({ ...outputMap, sources: changedSources }));
const changedContent = [...outputMap.sourcesContent]; changedContent[0] += '\n';
rejected('actual output one embedded source changed', () => verifyMutated({ ...outputMap, sourcesContent: changedContent }));
rejected('actual output debugId changed', () => verifyMutated({ ...outputMap, debugId: 'corrupt' }));
rejected('actual output name table changed', () => verifyMutated({ ...outputMap, names: ['corrupt'] }));
rejected('actual output trailing comma-empty segment', () => validateEveryMapping({ ...outputMap, mappings: outputMap.mappings + ',' }, renamedCode));
rejected('actual edit first old identifier corrupted', () => reconstruct([{ ...edits[0], old: 'WRONG' }, ...edits.slice(1)]));
rejected('actual edit first start moved out of range', () => reconstruct([{ ...edits[0], start: -1 }, ...edits.slice(1)]));
rejected('actual edit first replacement corrupted', () => reconstruct([{ ...edits[0], replacement: edits[0].replacement + '_' }, ...edits.slice(1)]));
rejected('actual output bytes corrupted after all edits', () => reconstruct(edits, Buffer.concat([namedBytes, Buffer.from('x')])));
rejected('named map placed one directory deeper breaks source identity', () => assert.equal(sourceResolution(outputMap, `${base}/named/deeper/cli.js.map`, outputMap.sources[0]), sourceRows[0].resolvedPath && path.resolve(sourceRows[0].resolvedPath)));
assert.equal(sourceRows.length,4771);
assert.equal(contentDifferences.length,0);
assert.equal(sourceRows.filter(x=>x.withinV45InputTree).length,4767);
assert.equal(missingSources.length,4);
const after = authenticate();
assert.deepEqual(after, before, 'all authenticated inputs and oracle evidence unchanged');
assert.equal(hash(fs.readFileSync(verifierPath)), verifierSHA256, 'review verifier unchanged during execution');
for (const source of sourceRows) {
  assert.equal(source.withinV45InputTree && fs.existsSync(source.resolvedPath), source.readFromPhysicalStage, 'source availability unchanged');
  if (!source.readFromPhysicalStage) continue;
  const b = regular(path.resolve(source.resolvedPath));
  assert.equal(b.length, source.diskBytes, source.resolvedPath + ' bytes after');
  assert.equal(hash(b), source.diskSha256, source.resolvedPath + ' pin after');
  assert.equal(path.relative(process.cwd(), fs.realpathSync(source.resolvedPath)), source.realPath, 'source target unchanged');
}
for (const source of virtualSourceIdentities) {
  const b = regular(path.resolve(source.stagedPath));
  assert.equal(hash(b), source.stagedSha256, 'virtual staged source unchanged');
  assert.equal(b.length, source.stagedBytes);
}
write('source-identities.json', { count: sourceRows.length, distinctSourceTargets, sources: sourceRows });
write('virtual-source-identities.json', { count: virtualSourceIdentities.length, sources: virtualSourceIdentities, allEmbeddedContentsAccountedFor: true, historicalPathsNotRead: true });
fs.writeFileSync(`${out}/removed-interior-mappings.jsonl`, removed.map(row => JSON.stringify(row) + '\n').join(''), { flag: 'wx' });
write('negative-controls.json', { kind: 'actual-integrated-v45-corruption-rejection-controls', controls, passed: controls.length, allMutationsInMemoryOnly: true, applicationExecuted: false, ASTParsed: false });
const result = {
  kind: 'independent-public-layout-v45-map-review', status: 'bounded-data-only-verification-passed',
  inputs: before.inputs, inputPinSha256: expectedPinSHA, oraclePins,
  verifierSHA256,
  fullEditUTF16AndUTF8ReconstructionVerified: true, reconstruction,
  allEditStringsAreASCIIIdentifierOrPrivateNameSpellings: true,
  privateNameEdits: edits.filter(e => e.old.startsWith('#')).length,
  editLengths: { shrinking, growing, sameLength, oldUnits, replacementUnits, deltaUTF16: replacementUnits - oldUnits },
  inputMapValidity, outputMapValidity, verification, verificationMs,
  allNonMappingsMetadataUnchanged: true,
  metadataSHA256: hash(JSON.stringify(meta(map))),
  tableHashes: { sources: hash(JSON.stringify(map.sources)), sourcesContent: hash(JSON.stringify(map.sourcesContent)), names: hash(JSON.stringify(map.names)) },
  sourceIdentities: { count: sourceRows.length, distinctSourceTargets, allFinalAndNamedTargetsEqual: true, allAvailableOnDiskSourcesAuthenticatedBeforeAndAfter: true, resolvedWithinV45InputTree: sourceRows.filter(x => x.withinV45InputTree).length, resolvedOutsideV45InputTree: sourceRows.filter(x => !x.withinV45InputTree).length, embeddedContentMatchesDisk: sourceRows.filter(x => x.diskMatchesEmbedded === true).length, embeddedContentDiffersFromDisk: contentDifferences.length, differingIndices: contentDifferences.map(x => x.index), nonPhysicalStageSourceCount: missingSources.length, nonPhysicalStageSourceIndices: missingSources.map(x => x.index), indexPath: `${out}/source-identities.json` },
  virtualSourceIdentities: { declaredAndReceiptAuthenticated: virtualSourceIdentities.length, embeddedContentMatchesStagedSource: virtualSourceIdentities.length, unaccountedEmbeddedSources: 0, historicalPathsNotRead: true, indexPath: `${out}/virtual-source-identities.json` },
  placement: { from: `${base}/final/cli.js.map`, to: `${base}/named/cli.js.map`, sameParentSiblingDirectories: true, allRelativeSourceResolutionsUnchanged: true, mapFileFieldPresent: 'file' in outputMap, sourceRootPresent: 'sourceRoot' in outputMap, codeFooter: footer(renamedCode), standaloneSourceMappingURLPresent: footer(renamedCode).some(x => x.startsWith('//# sourceMappingURL=')) },
  debugId: { value: outputMap.debugId, unchangedFromPreNamingMapAndCode: true, regeneratedForNamedBytes: false, provenanceVerified: false, qualification: 'Conservation of the prior debugId is verified. Its content-derived validity, uniqueness and external consumer association for renamed bytes are not established.' },
  rawSourceProvenanceQualification: 'This review verifies composition relative to the authenticated final pre-naming map, including all embedded source bytes and source identities. It does not establish compiler/source provenance or original-source coordinate truth. Any pre-existing raw-to-final source-map displacement remains outside this conservation proof.',
  negativeControlsPassed: controls.length,
  allInputOracleAndSourcePinsUnchanged: true,
  glbConvention: 'Same-line greatest generated column at or before the query; last original segment at duplicate columns wins. Retained duplicate sequences are preserved. Changed identifier interiors inherit old-start state, and ends restore old-end state.',
  limits: ['No application execution or AST parse.', 'No compiler, emitter or full name transform run.', 'No inverse-map, LUB, cross-line fallback or external consumer claim.', 'Raw-source provenance and debugId policy remain qualified.', 'Public package acceptance additionally requires complete strict AST, output commitments and reviewed source/toolchain lineage.'],
  peakNodeRSSBytes: process.resourceUsage().maxRSS * 1024, heapLimitMiB: 2048,
  applicationExecuted: false, ASTParsed: false, compilerExecuted: false, fullNameTransformExecuted: false,
  archiveOnlyReplayEstablished: false, releaseReady: false, wholeVersionAccepted: false
};
assert(result.peakNodeRSSBytes < 3000000000, 'RSS ceiling');
write('actual-map-review.json', result);
console.log(JSON.stringify(result));
