#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_UDS_CLIENT_OWNER_OVERRIDES,
  TARGET119_UDS_CLIENT_PROOF_SPECS,
} from './uds-client-owner-overrides.mjs'

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
const sourcePath = path.join(sourceRoot, 'utils/udsClient.ts')

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
  source: Object.freeze({
    path: 'src/utils/udsClient.ts',
    bytes: 7441,
    sha256: '9dcee42c4c88b9e63c4888c0005f6f7a65732a1e8c8a481e8e3558581bb350cc',
  }),
  targetModule: Object.freeze({
    start: 7653227,
    end: 7656232,
    bytes: 3005,
    sha256: 'aaacc8025656fe51d3450ed16e70b88cb18473d04bd657755fc0b97f7c0e6a43',
    exportTableEnd: 7653360,
    identifierOffsets: Object.freeze({
      GO7: Object.freeze([7653231, 7653241]),
      TM1: Object.freeze([7653369, 7654678]),
      VM1: Object.freeze([7653417, 7654814]),
      kM1: Object.freeze([7654054, 7655842]),
      'Qf$': Object.freeze([7653354, 7655467]),
      q88: Object.freeze([7656043]),
      ZM1: Object.freeze([7653383, 7656031, 7656150]),
      vM1: Object.freeze([7653431, 7656035, 7656200]),
    }),
  }),
  targetUnits: Object.freeze({
    12160: Object.freeze({
      start: 7654045,
      end: 7654220,
      nodeType: 'FunctionDeclaration',
      sourceHash:
        'd9ca9e403aeef9424efca31bcf86f8039423889806507006d5a25e270b154322',
    }),
    12162: Object.freeze({
      start: 7655452,
      end: 7655733,
      nodeType: 'FunctionDeclaration',
      sourceHash:
        'e95d415c1712017e9cc13d10973260cc969f4325ee06812011ed0e0e8b072de1',
    }),
    12165: Object.freeze({
      start: 7656039,
      end: 7656232,
      nodeType: 'VariableDeclaration',
      sourceHash:
        'f612678987468aa8fd48c9d78bb41091eaaae2713b7a0d5e831e0568f1982d66',
    }),
  }),
  sourceScopes: Object.freeze({
    probeSocket: Object.freeze({
      start: 2421,
      end: 2799,
      bytes: 378,
      sha256: '825ed0386d3f2249d80f41797e5784df31b9cb0de35b8591c5d67f384bd5a167',
    }),
    sessionKind: Object.freeze({
      start: 2894,
      end: 3105,
      bytes: 211,
      sha256: '076fb19bb240cfa9dc95f11ebd5bd63ebc4fb039163d5a8d6c0e895018aa7503',
    }),
    sessionStatus: Object.freeze({
      start: 3107,
      end: 3277,
      bytes: 170,
      sha256: '5b66969c137d05b11277270f64186f43d080f46be29c2e9e1f5d5174a1c7720c',
    }),
    listAllLiveSessions: Object.freeze({
      start: 6004,
      end: 6790,
      bytes: 786,
      sha256: '6f6b0585decc8b6af06c15a08460018d9226b97c15bd0217f1b2fe9af29561b1',
    }),
  }),
  units: 3,
  residues: 4,
  targetIndicesSha256:
    '7e021b4a203aa49d61b40cc235d3ddacf0cdc5eef4af2a2e68e8a0d69e457a09',
  residueIdentitiesSha256:
    '64f9678a2333ec049f8ffb9436cb8ef1453b85d1d8ada3778af876eff7c861d6',
})

const RECOVERED_SOURCE_PHASE = Object.freeze({
  source: Object.freeze({
    path: 'src/utils/udsClient.ts',
    bytes: 7275,
    sha256: 'af64419e15b607cce8e1eb3aaab6683d29cf4a958433630bd0f29bc83c23dfec',
  }),
  sourceScopes: Object.freeze({
    listAllLiveSessions: Object.freeze({
      start: 5838,
      end: 6624,
      bytes: 786,
      sha256: '6f6b0585decc8b6af06c15a08460018d9226b97c15bd0217f1b2fe9af29561b1',
    }),
  }),
})

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const descriptorAt = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})
const jsonDigest = value => sha256(Buffer.from(JSON.stringify(value)))

function readExact(filename, expected, label) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function identity(kind, value) {
  return JSON.stringify([kind, value])
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
      if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') {
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

function sourceFunctionMap(ts, sourceFile) {
  return new Map(
    sourceFile.statements
      .filter(
        statement =>
          ts.isFunctionDeclaration(statement) &&
          statement.name?.text,
      )
      .map(statement => [statement.name.text, statement]),
  )
}

function sourceStringLiterals(ts, node) {
  const values = []
  function visit(child) {
    if (ts.isStringLiteralLike(child)) values.push(child.text)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return values
}

function identifierCount(ts, node, name) {
  let count = 0
  function visit(child) {
    if (ts.isIdentifier(child) && child.text === name) count += 1
    ts.forEachChild(child, visit)
  }
  visit(node)
  return count
}

function targetIdentifierOffsets(source, baseOffset, names) {
  const offsets = Object.fromEntries(names.map(name => [name, []]))
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Identifier' && offsets[node.name]) {
      offsets[node.name].push(baseOffset + node.start)
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return offsets
}

function targetLiteralValues(source) {
  const values = []
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') values.push(node.value)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return values
}

function closedValidatorAssignments(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  const assignments = new Map()
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.operator === '=' &&
      node.left.type === 'Identifier' &&
      node.right.type === 'ArrayExpression' &&
      node.right.elements.every(
        element => element?.type === 'Literal' && typeof element.value === 'string',
      )
    ) {
      assignments.set(
        node.left.name,
        node.right.elements.map(element => element.value),
      )
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return assignments
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
const sourceBytes = fs.readFileSync(sourcePath)
const sourceFileDescriptor = descriptor(sourceBytes)
const historicalSourcePhase =
  sourceFileDescriptor.bytes === EXPECTED.source.bytes &&
  sourceFileDescriptor.sha256 === EXPECTED.source.sha256
const recoveredSourcePhase =
  sourceFileDescriptor.bytes === RECOVERED_SOURCE_PHASE.source.bytes &&
  sourceFileDescriptor.sha256 === RECOVERED_SOURCE_PHASE.source.sha256
assert.ok(
  historicalSourcePhase || recoveredSourcePhase,
  `Target119 UDS source phase: ${JSON.stringify(sourceFileDescriptor)}`,
)
const structural = JSON.parse(gunzipSync(structuralBytes))
const analysis = JSON.parse(analysisBytes)
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const supplementMappings = new Map(
  analysis.analysis.sourceSupplementGaps.map(mapping => [
    mapping.targetIndex,
    mapping,
  ]),
)
const targetText = targetBundle.toString('utf8')
const moduleStart = targetText.indexOf('var GO7={};')
assert.equal(
  targetText.indexOf('var GO7={};', moduleStart + 1),
  -1,
  'one UDS export table',
)
assert.equal(moduleStart, EXPECTED.targetModule.start)
const moduleBytes = targetBundle.subarray(
  EXPECTED.targetModule.start,
  EXPECTED.targetModule.end,
)
assert.deepEqual(
  descriptorAt(
    targetBundle,
    EXPECTED.targetModule.start,
    EXPECTED.targetModule.end,
  ),
  {
    start: EXPECTED.targetModule.start,
    end: EXPECTED.targetModule.end,
    bytes: EXPECTED.targetModule.bytes,
    sha256: EXPECTED.targetModule.sha256,
  },
)
const moduleText = moduleBytes.toString('utf8')
assert.deepEqual(
  targetIdentifierOffsets(
    moduleText,
    EXPECTED.targetModule.start,
    Object.keys(EXPECTED.targetModule.identifierOffsets),
  ),
  EXPECTED.targetModule.identifierOffsets,
  'complete UDS target-module binding graph',
)
const validatorAssignments = closedValidatorAssignments(moduleText)
assert.deepEqual(validatorAssignments.get('ZM1'), [
  'interactive',
  'bg',
  'daemon',
  'daemon-worker',
])
assert.deepEqual(validatorAssignments.get('vM1'), [
  'busy',
  'idle',
  'waiting',
])

const ts = await loadTypeScript()
const sourceText = sourceBytes.toString('utf8')
const sourceFile = ts.createSourceFile(
  'src/utils/udsClient.ts',
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)
const functions = sourceFunctionMap(ts, sourceFile)
const activeSourceScopes = recoveredSourcePhase
  ? { ...EXPECTED.sourceScopes, ...RECOVERED_SOURCE_PHASE.sourceScopes }
  : EXPECTED.sourceScopes
const sourceScopes = new Map(
  Object.entries(EXPECTED.sourceScopes).map(([name, expected]) => [
    name,
    { name, kind: 'FunctionDeclaration', ...expected },
  ]),
)
for (const [name, expected] of Object.entries(activeSourceScopes)) {
  const statement = functions.get(name)
  assert.ok(statement, `source declaration ${name}`)
  const actual = descriptorAt(
    sourceBytes,
    statement.getStart(sourceFile),
    statement.end,
  )
  assert.deepEqual(actual, {
    start: expected.start,
    end: expected.end,
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
}
const netImports = sourceFile.statements.filter(
  statement =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === 'net',
)
assert.equal(netImports.length, 1)
assert.equal(identifierCount(ts, netImports[0], 'connect'), 1)
assert.equal(identifierCount(ts, functions.get('probeSocket'), 'connect'), 1)
assert.equal(
  identifierCount(ts, functions.get('listAllLiveSessions'), 'procStart'),
  2,
)
assert.deepEqual(sourceStringLiterals(ts, functions.get('sessionKind')), [
  'interactive',
  'bg',
  'daemon',
  'daemon-worker',
])
assert.deepEqual(sourceStringLiterals(ts, functions.get('sessionStatus')), [
  'busy',
  'idle',
  'waiting',
])

const targetIndices = TARGET119_UDS_CLIENT_PROOF_SPECS.map(
  spec => spec.targetIndex,
)
const canonicalRows = TARGET119_UDS_CLIENT_PROOF_SPECS.flatMap(spec =>
  spec.residues.map(residue => [
    spec.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ]),
)
assert.equal(targetIndices.length, EXPECTED.units)
assert.equal(canonicalRows.length, EXPECTED.residues)
assert.equal(jsonDigest(targetIndices), EXPECTED.targetIndicesSha256)
assert.equal(jsonDigest(canonicalRows), EXPECTED.residueIdentitiesSha256)

const baselineOccurrences = bundleOccurrences(baselineBundle.toString('utf8'))
const targetOccurrences = bundleOccurrences(targetText)
const overrideByIndex = new Map(
  TARGET119_UDS_CLIENT_OWNER_OVERRIDES.map(override => [
    override.targetIndex,
    override,
  ]),
)
const rows = []
for (const spec of TARGET119_UDS_CLIENT_PROOF_SPECS) {
  const region = regions.get(spec.targetIndex)
  const expectedTarget = EXPECTED.targetUnits[spec.targetIndex]
  assert.ok(region, `u${spec.targetIndex}: structural region`)
  assert.deepEqual(
    {
      start: region.target.start,
      end: region.target.end,
      nodeType: region.target.nodeType,
      sourceHash: region.target.sourceHash,
    },
    expectedTarget,
  )
  assert.equal(
    sha256(targetBundle.subarray(region.target.start, region.target.end)),
    expectedTarget.sourceHash,
  )
  const mapping = supplementMappings.get(spec.targetIndex)
  assert.ok(mapping, `u${spec.targetIndex}: frozen source-gap mapping`)
  assert.deepEqual(mapping.ownerPaths, ['utils/fileHistory.ts'])
  assert.equal(mapping.residues, spec.residues.length)
  assert.equal(
    mapping.residueIdentitiesSha256,
    jsonDigest(
      spec.residues.map(residue => [
        spec.targetIndex,
        residue.kind,
        residue.value,
        residue.start,
        residue.end,
        residue.baselineCount,
        residue.targetOrdinal,
      ]),
    ),
  )
  for (const residue of spec.residues) {
    const key = identity(residue.kind, residue.value)
    assert.equal(
      (baselineOccurrences.get(key) ?? []).length,
      residue.baselineCount,
      `u${spec.targetIndex}: baseline ${key}`,
    )
    assert.deepEqual(
      (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1],
      { start: residue.start, end: residue.end },
      `u${spec.targetIndex}: target ${key}`,
    )
    assert.ok(
      residue.start >= region.target.start && residue.end <= region.target.end,
      `u${spec.targetIndex}: residue inside complete unit`,
    )
  }
  const unitValues = targetLiteralValues(
    targetText.slice(region.target.start, region.target.end),
  )
  if (spec.targetIndex === 12160) {
    assert.equal(unitValues.filter(value => value === 'connect').length, 1)
    assert.equal(unitValues.filter(value => value === 'error').length, 1)
    assert.equal(unitValues.filter(value => value === 250).length, 1)
  } else if (spec.targetIndex === 12162) {
    assert.equal(
      targetText
        .slice(region.target.start, region.target.end)
        .split('procStart').length - 1,
      2,
    )
  } else {
    assert.deepEqual(validatorAssignments.get('ZM1'), [
      'interactive',
      'bg',
      'daemon',
      'daemon-worker',
    ])
  }
  const override = overrideByIndex.get(spec.targetIndex)
  assert.ok(override, `u${spec.targetIndex}: owner override`)
  rows.push({
    targetIndex: spec.targetIndex,
    ownerPath: override.paths[0],
    priorOwnerPaths: mapping.ownerPaths.map(ownerPath => `src/${ownerPath}`),
    behavior: override.behavior,
    evidenceIds: override.evidenceIds,
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      sourceHash: region.target.sourceHash,
    },
    source: EXPECTED.source,
    sourceScopes: spec.sourceScopes.map(name => sourceScopes.get(name)),
    representation: spec.representation,
    residues: spec.residues,
    frozenAnalysis: {
      residues: mapping.residues,
      residueIdentitiesSha256: mapping.residueIdentitiesSha256,
    },
  })
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'authenticated-uds-client-declaration-and-module-owner-proof',
  criterion:
    'exact-authenticated-module-window-plus-complete-target-unit-plus-closed-source-declaration-binding-v1',
  evidenceIds: TARGET119_UDS_CLIENT_OWNER_OVERRIDES[0].evidenceIds,
  inputs: {
    baselineBundle: EXPECTED.baselineBundle,
    targetBundle: EXPECTED.targetBundle,
    structural: EXPECTED.structural,
    frozenAnalysis: EXPECTED.analysis,
    sourceFiles: [EXPECTED.source],
  },
  targetModule: {
    start: EXPECTED.targetModule.start,
    end: EXPECTED.targetModule.end,
    bytes: EXPECTED.targetModule.bytes,
    sha256: EXPECTED.targetModule.sha256,
    exportTable: descriptorAt(
      targetBundle,
      EXPECTED.targetModule.start,
      EXPECTED.targetModule.exportTableEnd,
    ),
    identifierOffsets: EXPECTED.targetModule.identifierOffsets,
    validatorAssignments: Object.fromEntries(validatorAssignments),
  },
  summary: {
    units: EXPECTED.units,
    residues: EXPECTED.residues,
    sourceFiles: 1,
    representations: {
      'closed-validator-set-hoisting': 2,
      'complete-declaration-lowering': 2,
    },
    targetIndicesSha256: EXPECTED.targetIndicesSha256,
    residueIdentitiesSha256: EXPECTED.residueIdentitiesSha256,
  },
  ownerOverrides: TARGET119_UDS_CLIENT_OWNER_OVERRIDES,
  rows,
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
