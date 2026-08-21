#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_UDS_REGISTRY_BLOCK_AFTER,
  TARGET119_UDS_REGISTRY_BLOCK_BEFORE,
  TARGET119_UDS_REGISTRY_INPUT,
  TARGET119_UDS_REGISTRY_OUTPUT,
  TARGET119_UDS_REGISTRY_OWNER_OVERRIDES,
  TARGET119_UDS_REGISTRY_RESIDUES,
  buildTarget119UdsRegistryOutput,
} from './replay-uds-registry-source-gap.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const baselineBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
    ),
)
const targetBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
    ),
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const analysisPath = path.join(
  root,
  'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
)
const sourcePath = path.join(
  sourceRoot,
  TARGET119_UDS_REGISTRY_INPUT.path.replace(/^src\//, ''),
)

const EXPECTED = Object.freeze({
  baselineBundle: Object.freeze({
    artifact: '2.1.118-linux-x64/cli.inner.js',
    bytes: 13234618,
    sha256: '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa',
  }),
  targetBundle: Object.freeze({
    artifact: '2.1.119-linux-x64/cli.inner.js',
    bytes: 13720987,
    sha256: '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
  }),
  structural: Object.freeze({
    path:
      'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
    bytes: 2550437,
    sha256: 'fc8a30dd71e19a8208827c571a217d014218acb725eb8b104a548f98a7c67839',
  }),
  analysis: Object.freeze({
    path: 'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
    bytes: 751734,
    sha256: '2f724f6eeb76b532bb76c264887e78fce4c4435f073992d2cc539ca12890edc7',
  }),
  targetUnit: Object.freeze({
    classification: 'unresolved',
    nodeType: 'FunctionDeclaration',
    start: 7654220,
    end: 7655452,
    bytes: 1232,
    sourceHash:
      '41d5d438a23e045ffeaf64580f8bd88bbff305ae00b696e5f4311c8d2a879f6d',
  }),
  targetModule: Object.freeze({
    start: 7653227,
    end: 7656232,
    bytes: 3005,
    sha256: 'aaacc8025656fe51d3450ed16e70b88cb18473d04bd657755fc0b97f7c0e6a43',
  }),
  sourcePreimageScope: Object.freeze({
    name: 'readRegistry',
    kind: 'FunctionDeclaration',
    start: 3279,
    end: 6002,
    bytes: 2723,
    sha256: 'cd2f1ebb85fb2c31f3c7354a17718005383ee41584fcb369c04d1d6545b96ea9',
  }),
  sourcePostimageScope: Object.freeze({
    name: 'readRegistry',
    kind: 'FunctionDeclaration',
    start: 3279,
    end: 5836,
    bytes: 2557,
    sha256: '1bb7bba6126c8725ac349b30988b10e319ecde763fbc6c8bc05e313369f23063',
  }),
  targetIndicesSha256:
    'b7e37458c2ae5f09c5e13619f7fb76b3621beef147181199947981453dbe09fe',
  residueIdentitiesSha256:
    '2cf15bc8f2bcfe781acf43d43b91380e80586777200ee430ead752505f54617a',
})

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const jsonDigest = value => sha256(Buffer.from(JSON.stringify(value)))

function readExact(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function bundleOccurrences(source) {
  const occurrences = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const rows = occurrences.get(key) ?? []
    rows.push({ start: node.start, end: node.end })
    occurrences.set(key, rows)
  }
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) {
        add(
          'regexp',
          {
            pattern: node.regex.pattern,
            flags: canonicalFlags(node.regex.flags),
          },
          node,
        )
      } else if (typeof node.value === 'string') {
        add('string', node.value, node)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  for (const rows of occurrences.values()) {
    rows.sort((left, right) => left.start - right.start)
  }
  return occurrences
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function findFunction(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, `one source declaration ${name}`)
  return matches[0]
}

function scopeDescriptor(source, sourceFile, statement) {
  const start = statement.getStart(sourceFile)
  const end = statement.end
  return {
    name: statement.name.text,
    kind: 'FunctionDeclaration',
    start,
    end,
    ...descriptor(source.subarray(start, end)),
  }
}

const baselineBundle = readExact(
  baselineBundlePath,
  EXPECTED.baselineBundle,
  'Target118 baseline bundle',
)
const targetBundle = readExact(
  targetBundlePath,
  EXPECTED.targetBundle,
  'Target119 target bundle',
)
const structuralBytes = readExact(
  structuralPath,
  EXPECTED.structural,
  'Target119 structural delta',
)
const analysisBytes = readExact(
  analysisPath,
  EXPECTED.analysis,
  'Target119 frozen owner-residue analysis',
)
const sourceInput = fs.readFileSync(sourcePath)
const sourceState =
  sourceInput.length === TARGET119_UDS_REGISTRY_INPUT.bytes &&
  sha256(sourceInput) === TARGET119_UDS_REGISTRY_INPUT.sha256
    ? 'raw'
    : sourceInput.length === TARGET119_UDS_REGISTRY_OUTPUT.bytes &&
        sha256(sourceInput) === TARGET119_UDS_REGISTRY_OUTPUT.sha256
      ? 'recovered'
      : null
assert.ok(sourceState, 'Target119 UDS registry source is exact raw or postimage')
const rawSource =
  sourceState === 'raw'
    ? sourceInput
    : Buffer.from(
        sourceInput
          .toString('utf8')
          .replace(
            TARGET119_UDS_REGISTRY_BLOCK_AFTER,
            TARGET119_UDS_REGISTRY_BLOCK_BEFORE,
          ),
      )
assert.deepEqual(descriptor(rawSource), {
  bytes: TARGET119_UDS_REGISTRY_INPUT.bytes,
  sha256: TARGET119_UDS_REGISTRY_INPUT.sha256,
})
const recoveredSource = Buffer.from(
  buildTarget119UdsRegistryOutput(rawSource.toString('utf8')),
)
assert.deepEqual(descriptor(recoveredSource), {
  bytes: TARGET119_UDS_REGISTRY_OUTPUT.bytes,
  sha256: TARGET119_UDS_REGISTRY_OUTPUT.sha256,
})

const ts = await loadTypeScript()
const rawSourceFile = ts.createSourceFile(
  TARGET119_UDS_REGISTRY_INPUT.path,
  rawSource.toString('utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)
const recoveredSourceFile = ts.createSourceFile(
  TARGET119_UDS_REGISTRY_OUTPUT.path,
  recoveredSource.toString('utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)
assert.equal(rawSourceFile.parseDiagnostics.length, 0)
assert.equal(recoveredSourceFile.parseDiagnostics.length, 0)
const rawScope = findFunction(ts, rawSourceFile, 'readRegistry')
const recoveredScope = findFunction(ts, recoveredSourceFile, 'readRegistry')
assert.deepEqual(
  scopeDescriptor(rawSource, rawSourceFile, rawScope),
  EXPECTED.sourcePreimageScope,
)
assert.deepEqual(
  scopeDescriptor(recoveredSource, recoveredSourceFile, recoveredScope),
  EXPECTED.sourcePostimageScope,
)
const recoveredText = recoveredScope.getText(recoveredSourceFile)
for (const fragment of [
  "parseInt(file.replace(/\\.json$/, ''), 10)",
  "sock: (raw.messagingSocketPath as string | undefined) ?? ''",
  "cwd: (raw.cwd as string | undefined) ?? '?'",
  'startedAt: (raw.startedAt as number | undefined) ?? 0',
  'name: raw.name as string | undefined',
  'sessionId: raw.sessionId as string | undefined',
  'logPath: raw.logPath as string | undefined',
  "typeof raw.waitingFor === 'string' ? raw.waitingFor : undefined",
  "typeof raw.peerProtocol === 'number' ? raw.peerProtocol : undefined",
]) {
  assert.equal(
    recoveredText.split(fragment).length - 1,
    1,
    `recovered source fragment ${fragment}`,
  )
}

const structural = JSON.parse(gunzipSync(structuralBytes))
const region = structural.regions.find(
  candidate => candidate.target.index === 12161,
)
assert.ok(region, 'Target119 u12161 structural region')
assert.deepEqual(
  {
    classification: region.classification,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    sourceHash: region.target.sourceHash,
  },
  EXPECTED.targetUnit,
)
assert.equal(
  sha256(targetBundle.subarray(region.target.start, region.target.end)),
  EXPECTED.targetUnit.sourceHash,
)
assert.deepEqual(
  descriptor(
    targetBundle.subarray(EXPECTED.targetModule.start, EXPECTED.targetModule.end),
  ),
  { bytes: EXPECTED.targetModule.bytes, sha256: EXPECTED.targetModule.sha256 },
)

const analysis = JSON.parse(analysisBytes)
const mapping = analysis.analysis.sourceSupplementGaps.find(
  candidate => candidate.targetIndex === 12161,
)
assert.ok(mapping, 'Target119 u12161 frozen source-gap mapping')
assert.deepEqual(mapping.ownerPaths, ['utils/fileHistory.ts'])
assert.equal(mapping.residues, TARGET119_UDS_REGISTRY_RESIDUES.length)
const canonicalRows = TARGET119_UDS_REGISTRY_RESIDUES.map(residue => [
  12161,
  residue.kind,
  residue.value,
  residue.start,
  residue.end,
  residue.baselineCount,
  residue.targetOrdinal,
])
assert.equal(jsonDigest([12161]), EXPECTED.targetIndicesSha256)
assert.equal(jsonDigest(canonicalRows), EXPECTED.residueIdentitiesSha256)
assert.equal(mapping.residueIdentitiesSha256, EXPECTED.residueIdentitiesSha256)

const baselineOccurrences = bundleOccurrences(baselineBundle.toString('utf8'))
const targetOccurrences = bundleOccurrences(targetBundle.toString('utf8'))
for (const residue of TARGET119_UDS_REGISTRY_RESIDUES) {
  const key = identity(residue.kind, residue.value)
  assert.equal(
    (baselineOccurrences.get(key) ?? []).length,
    residue.baselineCount,
    `baseline occurrence ${key}`,
  )
  assert.deepEqual(
    (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1],
    { start: residue.start, end: residue.end },
    `target occurrence ${key}`,
  )
  assert.ok(
    residue.start >= EXPECTED.targetUnit.start &&
      residue.end <= EXPECTED.targetUnit.end,
  )
}

const override = TARGET119_UDS_REGISTRY_OWNER_OVERRIDES[0]
const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'authenticated-uds-registry-source-replay',
  criterion:
    'exact-authenticated-target-unit-plus-closed-registry-field-semantics-plus-idempotent-source-replay-v1',
  evidenceIds: override.evidenceIds,
  inputs: {
    baselineBundle: EXPECTED.baselineBundle,
    targetBundle: EXPECTED.targetBundle,
    structural: EXPECTED.structural,
    frozenAnalysis: EXPECTED.analysis,
    sourcePreimage: TARGET119_UDS_REGISTRY_INPUT,
    sourcePostimage: TARGET119_UDS_REGISTRY_OUTPUT,
    sourcePreimageScope: EXPECTED.sourcePreimageScope,
    sourcePostimageScope: EXPECTED.sourcePostimageScope,
  },
  targetModule: EXPECTED.targetModule,
  summary: {
    units: 1,
    residues: TARGET119_UDS_REGISTRY_RESIDUES.length,
    targetIndicesSha256: EXPECTED.targetIndicesSha256,
    residueIdentitiesSha256: EXPECTED.residueIdentitiesSha256,
  },
  ownerOverrides: TARGET119_UDS_REGISTRY_OWNER_OVERRIDES,
  rows: [
    {
      targetIndex: 12161,
      ownerPath: override.paths[0],
      priorOwnerPaths: mapping.ownerPaths.map(ownerPath => `src/${ownerPath}`),
      evidenceIds: override.evidenceIds,
      behavior: override.behavior,
      target: EXPECTED.targetUnit,
      sourcePreimageScope: EXPECTED.sourcePreimageScope,
      sourcePostimageScope: EXPECTED.sourcePostimageScope,
      representation: 'authenticated-source-replay',
      residues: TARGET119_UDS_REGISTRY_RESIDUES,
    },
  ],
  replay: {
    helper:
      'recovery/cases/2.1.118-to-2.1.119/recovered/replay-uds-registry-source-gap.mjs',
    sourcePath: TARGET119_UDS_REGISTRY_INPUT.path,
    edits: [
      'restore parseInt(file.replace(/\\.json$/, \'\'), 10) filename parsing',
      'restore target nullish defaults for messagingSocketPath, cwd, and startedAt',
      'restore target direct optional reads for name, sessionId, and logPath',
    ],
  },
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
