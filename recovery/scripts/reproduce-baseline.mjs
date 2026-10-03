#!/usr/bin/env node
// Fixed 2.1.88 source-only driver. No discovery/reference input or application execution.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const recovery = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for(const key of ['NODE_PATH','NODE_OPTIONS','BUN_OPTIONS']) assert.equal(process.env[key],undefined,`Launch with ${key} unset; ambient preload/runtime options are unsupported`);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const flags = ['--manifest', '--manifest-sha256', '--input-root', '--bun', '--output-root'];
const argv = process.argv.slice(2), args = {};
assert.equal(argv.length, flags.length * 2, 'Require --manifest --manifest-sha256 --input-root --bun --output-root');
for (let i = 0; i < argv.length; i += 2) { assert(flags.includes(argv[i]) && argv[i + 1] && !Object.hasOwn(args, argv[i])); args[argv[i]] = argv[i + 1]; }
const manifestPath = path.resolve(args['--manifest']);
assert.equal(manifestPath, path.join(recovery, 'baselines/2.1.88/manifest.json'));
assert(/^[0-9a-f]{64}$/.test(args['--manifest-sha256']));
const manifestBytes = fs.readFileSync(manifestPath);
assert.equal(sha(manifestBytes), args['--manifest-sha256'], 'Externally reviewed manifest digest differs');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.kind, 'portable-source-reproduction-baseline-v1'); assert.equal(manifest.version, '2.1.88');
// Authenticate the small root-boundary module before importing any non-builtin code.
const boundary = path.join(recovery, 'lib/reconstruction/checked-roots.mjs');
assert.equal(sha(fs.readFileSync(boundary)), manifest.rootBoundarySha256);
const { resolvePinnedInput } = await import(pathToFileURL(boundary));
const nodeReal = fs.realpathSync(process.execPath), bun = path.resolve(args['--bun']);
const roots = { recovery, nodeRuntime: path.dirname(nodeReal), bunRuntime: path.dirname(bun) };
assert.equal(process.version, manifest.nodeVersion);
assert.equal(resolvePinnedInput(roots, manifest.node), nodeReal);
assert.equal(resolvePinnedInput(roots, { ...manifest.bun, path: path.basename(bun) }), bun);
const authenticated = new Map();
for (const [name, pin] of Object.entries(manifest.files)) authenticated.set(name, resolvePinnedInput(roots, pin));
const adapterPins = JSON.parse(fs.readFileSync(authenticated.get('adapterToolchain')));
assert.equal(adapterPins.kind, 'reviewed-rooted-reconstruction-adapter-toolchain-v1');
for (const pin of adapterPins.files) resolvePinnedInput(roots, pin);
assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))), manifest.driverSha256);
const { runStage, requireStageSuccess } = await import(pathToFileURL(path.join(recovery, 'lib/reconstruction/driver-stage.mjs')));
const {inspectTerminalDebugComment,makeCanonicalFinalView,validateFinalizerOutputs}=await import(pathToFileURL(path.join(recovery,'lib/reconstruction/debug-comment-view.mjs')));
const debugPolicyBytes=fs.readFileSync(authenticated.get('debugCommentPolicy')),debugPolicy=JSON.parse(debugPolicyBytes);
assert.equal(debugPolicy.sourceProfileSha256,manifest.files.profile.sha256);
assert.equal(debugPolicy.stages.raw.canonicalSha256,manifest.expectedJS.raw.sha256);
assert.equal(debugPolicy.stages.final.canonicalSha256,manifest.expectedJS.final.sha256);
const inputRoot = path.resolve(args['--input-root']), out = path.resolve(args['--output-root']);
const overlaps = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
assert(!overlaps(inputRoot, out), 'Output overlaps source inputs');
assert(!overlaps(recovery, out), 'Output overlaps tool/profile tree');
assert(!fs.existsSync(out), 'Driver output root must not exist');
const common = ['--profile', authenticated.get('profile'), '--expected-profile-sha256', manifest.files.profile.sha256,
  '--toolchain', authenticated.get('adapterToolchain'), '--expected-toolchain-sha256', manifest.files.adapterToolchain.sha256,
  '--input-root', inputRoot, '--output-root', out];
const stages = [], driverReport = { kind: 'portable-baseline-driver-receipt', manifestSha256: sha(manifestBytes), logicalVersion: manifest.version, physicalRoots: roots, inputRoot, outputRoot: out, success: false, stages };
function save() { if (fs.existsSync(out)) fs.writeFileSync(path.join(out, 'driver-report.json'), JSON.stringify(driverReport, null, 2) + '\n'); }
function stage(name, executable, values) { const r = runStage(name, executable, values, { cwd: recovery }); stages.push(r); save(); return r; }
function pinJS(relative, expected) { const bytes = fs.readFileSync(path.join(out, relative)); assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256, `${relative}: frozen candidate bytes changed`); }
try {
  const compiler = path.join(recovery, 'lib/reconstruction/full-stage-compiler.mjs');
  const pre = stage('preflight', bun, ['--no-env-file', '--no-install', compiler, '--preflight', ...common]);
  assert.equal(pre.value.compilerInvoked, false); assert.equal(pre.value.outputWritten, false);
  const compile = requireStageSuccess(stage('compile', bun, ['--no-env-file', '--no-install', compiler, '--compile', ...common]));
  const physicalRawBytes=fs.readFileSync(path.join(out,'raw/cli.js'));
  const rawDebug=inspectTerminalDebugComment(physicalRawBytes,debugPolicy,'raw');
  driverReport.rawDebugCommentInspection={actual:rawDebug.actual,prefix:rawDebug.prefix,debugId:rawDebug.debugId};save();
  assert(/^[0-9a-f]{64}$/.test(compile.value.compileReportSha256));
  const finalStage=requireStageSuccess(stage('finalize', nodeReal, ['--max-old-space-size=384', path.join(recovery, 'lib/reconstruction/finalize-full-stage.mjs'), '--finalize', ...common, '--expected-compile-report-sha256', compile.value.compileReportSha256]));
  const physicalFinalBytes=fs.readFileSync(path.join(out,'final/cli.js')),finalizerReportBytes=fs.readFileSync(path.join(out,'late-link-report.json'));
  for(const pin of validateFinalizerOutputs(JSON.parse(finalizerReportBytes),finalStage.value))resolvePinnedInput({output:out},{root:'output',...pin});
  const actualFinalPin=finalStage.value.outputs.find(p=>p.path==='final/cli.js');assert(actualFinalPin);
  assert.equal(sha(physicalFinalBytes),actualFinalPin.sha256);assert.equal(physicalFinalBytes.length,actualFinalPin.bytes);
  const view=makeCanonicalFinalView({rawBytes:physicalRawBytes,finalBytes:physicalFinalBytes,policyBytes:debugPolicyBytes,expectedPolicySha256:manifest.files.debugCommentPolicy.sha256,
    compileReportBytes:fs.readFileSync(path.join(out,'compile-report.json')),expectedCompileReportSha256:compile.value.compileReportSha256,
    finalizerReportBytes,expectedFinalizerReportSha256:sha(finalizerReportBytes)});
  const canonicalDir=path.join(out,'canonical');assert(!fs.existsSync(canonicalDir));fs.mkdirSync(canonicalDir);
  fs.writeFileSync(path.join(canonicalDir,'final.js'),view.bytes,{flag:'wx'});
  fs.writeFileSync(path.join(canonicalDir,'debug-comment-receipt.json'),JSON.stringify(view.receipt,null,2)+'\n',{flag:'wx'});
  driverReport.canonicalDebugView=view.receipt;save();pinJS('canonical/final.js',manifest.expectedJS.final);
  const named = stage('frozen-naming', nodeReal, ['--max-old-space-size=6144', path.join(recovery, 'lib/reconstruction/naming/cli.mjs'),
    '--candidate', path.join(out, 'canonical/final.js'), '--recipe', authenticated.get('namingRecipe'), '--recipe-sha256', manifest.files.namingRecipe.sha256,
    '--tool-pins', authenticated.get('namingToolPins'), '--tool-pins-sha256', manifest.files.namingToolPins.sha256,
    '--output', path.join(out, 'replayed/cli.js'), '--receipt', path.join(out, 'replayed/name-receipt.json')]);
  assert.equal(named.value.status, 'emitted-frozen-bound-names'); pinJS('replayed/cli.js', manifest.expectedJS.replayed);
  const strict = stage('strict-whole-AST', nodeReal, ['--max-old-space-size=3072', path.join(recovery, 'scripts/strict-ast-digest.mjs'), path.join(out, 'replayed/cli.js')]);
  assert.deepEqual(strict.value, manifest.expectedAST, 'Complete emitted AST differs');
  for (const pin of adapterPins.files) resolvePinnedInput(roots, pin);
  for (const pin of Object.values(manifest.files)) resolvePinnedInput(roots, pin);
  assert.equal(sha(fs.readFileSync(manifestPath)), sha(manifestBytes));
  driverReport.success = true; driverReport.strictAST = strict.value; save();
  console.log(JSON.stringify({ success: true, outputRoot: out, emittedSha256: manifest.expectedJS.replayed.sha256, strictAST: strict.value, generatedApplicationExecuted: false }));
} catch (error) { driverReport.error = { message: error.message }; save(); throw error; }
