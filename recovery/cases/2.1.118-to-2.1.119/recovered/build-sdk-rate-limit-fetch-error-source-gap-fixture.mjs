#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  buildTarget119Check1mRateLimitOutput,
  buildTarget119SdkRateLimitOutput,
  TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_AFTER,
  TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE,
  TARGET119_CHECK_1M_RATE_LIMIT_INPUT,
  TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT,
  TARGET119_SDK_RATE_LIMIT_BLOCK_AFTER,
  TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE,
  TARGET119_SDK_RATE_LIMIT_INPUT,
  TARGET119_SDK_RATE_LIMIT_OUTPUT,
  TARGET119_SDK_RATE_LIMIT_OWNER_OVERRIDES,
} from './replay-sdk-rate-limit-fetch-error-source-gap.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const reportPath = path.join(
  root,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const baselineBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-sdk-rate-limit-fetch-error-source-gap.json',
)

const EXPECTED_SOURCE_FILES = 2023
const CONFIGS = Object.freeze([
  Object.freeze({
    targetIndex: 10175,
    residues: 15,
    priorOwnerPaths: Object.freeze(['src/tools/SkillTool/prompt.ts']),
    input: TARGET119_SDK_RATE_LIMIT_INPUT,
    output: TARGET119_SDK_RATE_LIMIT_OUTPUT,
    build: buildTarget119SdkRateLimitOutput,
    before: TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE,
    after: TARGET119_SDK_RATE_LIMIT_BLOCK_AFTER,
    sourceMarkers: Object.freeze([
      'Config scope for settings.',
      'Tool execution time in milliseconds. Excludes permission-prompt and hook time.',
      'Alternate names that resolve to this command (e.g., /cost and /stats both resolve to /usage)',
    ]),
    targetMarkers: Object.freeze([
      'Config scope for settings.',
      'Tool execution time in milliseconds. Excludes permission-prompt and hook time.',
      'Alternate names that resolve to this command (e.g., /cost and /stats both resolve to /usage)',
      'org_service_level_disabled',
      'no_limits_configured',
      'fetch_error',
    ]),
  }),
  Object.freeze({
    targetIndex: 12489,
    residues: 7,
    priorOwnerPaths: Object.freeze([
      'src/tasks/RemoteAgentTask/RemoteAgentTask.tsx',
    ]),
    input: TARGET119_CHECK_1M_RATE_LIMIT_INPUT,
    output: TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT,
    build: buildTarget119Check1mRateLimitOutput,
    before: TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE,
    after: TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_AFTER,
    sourceMarkers: Object.freeze([
      'Check if extra usage is enabled based on the cached disabled reason.',
      'cachedExtraUsageDisabledReason',
      'checkOpus1mAccess',
    ]),
    targetMarkers: Object.freeze([
      'out_of_credits',
      'org_service_level_disabled',
      'no_limits_configured',
      'fetch_error',
    ]),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files.sort()
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceValues(ts, sourceFile) {
  const values = new Set()
  function add(kind, value) {
    values.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))))
    }
    const namedProperty =
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    const property = namedProperty
      ? node.name.text
      : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

const ts = await loadTypeScript()
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const targetSource = targetBundle.toString('utf8')
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const reportBytes = fs.readFileSync(reportPath)
const report = JSON.parse(reportBytes)
const overrideByIndex = new Map(
  TARGET119_SDK_RATE_LIMIT_OWNER_OVERRIDES.map(override => [
    override.targetIndex,
    override,
  ]),
)

const sourceAudits = new Map()
for (const config of CONFIGS) {
  const filename = path.join(
    root,
    '.recovery-tmp/semantic-trees/2.1.119',
    config.input.path,
  )
  const input = fs.readFileSync(filename)
  if (input.length !== config.input.bytes || sha256(input) !== config.input.sha256) {
    throw new Error(`Target119 source preimage differs: ${config.input.path}`)
  }
  const output = Buffer.from(config.build(input.toString('utf8')))
  if (
    output.length !== config.output.bytes ||
    sha256(output) !== config.output.sha256
  ) {
    throw new Error(`Target119 source postimage differs: ${config.output.path}`)
  }
  const rawSourceFile = ts.createSourceFile(
    config.input.path,
    input.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    config.input.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const recoveredSourceFile = ts.createSourceFile(
    config.output.path,
    output.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    config.output.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (
    rawSourceFile.parseDiagnostics.length !== 0 ||
    recoveredSourceFile.parseDiagnostics.length !== 0
  ) {
    throw new Error(`Target119 source parse diagnostics: ${config.input.path}`)
  }
  sourceAudits.set(config.targetIndex, {
    input,
    output,
    rawValues: sourceValues(ts, rawSourceFile),
    recoveredValues: sourceValues(ts, recoveredSourceFile),
  })
}

const liveRows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
  CONFIGS.some(config => config.targetIndex === row.structural.index),
)
const expectedResidues = CONFIGS.reduce((sum, config) => sum + config.residues, 0)
const finalReportDescriptor = {
  bytes: 24_991_569,
  sha256: 'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
}
const preSourceGapReportDescriptor = {
  bytes: 24_727_372,
  sha256: '44893d07b612b3b5d6589da39ede97a02f57031e124875fad8b80cbc384d8e96',
}
const finalSourceGapProjection = [
  [10175, 'string', 'fetch_error', 5101263, 5101276, 0, 1],
  [12489, 'string', 'fetch_error', 7829267, 7829280, 0, 2],
]
const liveProjection = liveRows.map(canonicalResidue)
const reportDescriptor = descriptor(reportBytes)
let rowsByIndex
if (liveRows.length === expectedResidues) {
  rowsByIndex = new Map(
    CONFIGS.map(config => {
      const rows = liveRows.filter(
        row => row.structural.index === config.targetIndex,
      )
      if (rows.length !== config.residues) {
        throw new Error(`Target119 u${config.targetIndex} residue count differs`)
      }
      const prior = [
        ...new Set(rows.flatMap(row => row.ownerPaths ?? []).map(path_ => `src/${path_}`)),
      ].sort()
      if (JSON.stringify(prior) !== JSON.stringify([...config.priorOwnerPaths])) {
        throw new Error(`Target119 u${config.targetIndex} prior owner differs: ${prior}`)
      }
      return [config.targetIndex, { rows, priorOwnerPaths: prior }]
    }),
  )
} else if (
  fs.existsSync(fixturePath) &&
  ((liveRows.length === 0 &&
    JSON.stringify(reportDescriptor) ===
      JSON.stringify(preSourceGapReportDescriptor)) ||
    (liveRows.length === finalSourceGapProjection.length &&
      JSON.stringify(reportDescriptor) === JSON.stringify(finalReportDescriptor) &&
      JSON.stringify(liveProjection) === JSON.stringify(finalSourceGapProjection)))
) {
  const frozen = JSON.parse(fs.readFileSync(fixturePath))
  rowsByIndex = new Map(
    CONFIGS.map(config => {
      const frozenRow = frozen.rows?.find(
        row => row.targetIndex === config.targetIndex,
      )
      if (!frozenRow || frozenRow.residues.length !== config.residues) {
        throw new Error(`Target119 u${config.targetIndex} frozen row differs`)
      }
      return [
        config.targetIndex,
        {
          priorOwnerPaths: frozenRow.priorOwnerPaths,
          rows: frozenRow.residues.map(residue => ({
            structural: { index: config.targetIndex },
            literalKind: residue.kind,
            value: residue.value,
            target: { start: residue.start, end: residue.end },
            baselineOccurrenceCount: residue.baselineCount,
            targetOccurrenceNumber: residue.targetOrdinal,
          })),
        },
      ]
    }),
  )
} else {
  throw new Error(
    `Target119 paired rate-limit scanner is neither exact provisional nor corrected state (${liveRows.length} rows)`,
  )
}

const universe = sourceFiles(sourceRoot)
if (universe.length !== EXPECTED_SOURCE_FILES) {
  throw new Error(`Target119 source universe changed: ${universe.length}`)
}
const rows = []
const allCanonical = []
const representationCounts = {
  'source-file-ast': 0,
  'source-gap-replay': 0,
}
for (const config of CONFIGS) {
  const override = overrideByIndex.get(config.targetIndex)
  if (!override || override.paths[0] !== config.input.path) {
    throw new Error(`Target119 u${config.targetIndex} override differs`)
  }
  const region = structural.regions.find(
    item => item.target.index === config.targetIndex,
  )
  if (!region) throw new Error(`missing Target119 u${config.targetIndex}`)
  const targetText = targetSource.slice(region.target.start, region.target.end)
  if (sha256(targetText) !== region.target.sourceHash) {
    throw new Error(`Target119 u${config.targetIndex} target fragment differs`)
  }
  parse(targetText, { ecmaVersion: 'latest', sourceType: 'module' })
  for (const marker of config.targetMarkers) {
    if (!targetText.includes(marker)) {
      throw new Error(`Target119 u${config.targetIndex} lacks ${marker}`)
    }
  }
  const sourceRelative = config.input.path.replace(/^src\//, '')
  const markerCandidates = universe.filter(relative => {
    const text = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
    return config.sourceMarkers.every(marker => text.includes(marker))
  })
  if (JSON.stringify(markerCandidates) !== JSON.stringify([sourceRelative])) {
    throw new Error(
      `Target119 u${config.targetIndex} marker candidates differ: ${markerCandidates}`,
    )
  }
  const audit = sourceAudits.get(config.targetIndex)
  const frozen = rowsByIndex.get(config.targetIndex)
  const residues = frozen.rows.map(row => {
    const key = identity(row.literalKind, row.value)
    const representation = audit.rawValues.has(key)
      ? 'source-file-ast'
      : audit.recoveredValues.has(key)
        ? 'source-gap-replay'
        : null
    if (!representation) {
      throw new Error(
        `Target119 u${config.targetIndex} residue lacks source/replay proof: ${row.literalKind}:${JSON.stringify(row.value)}`,
      )
    }
    representationCounts[representation] += 1
    allCanonical.push(canonicalResidue(row))
    return {
      kind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineCount: row.baselineOccurrenceCount,
      targetOrdinal: row.targetOccurrenceNumber,
      representation,
    }
  })
  rows.push({
    targetIndex: config.targetIndex,
    priorOwnerPaths: frozen.priorOwnerPaths,
    sourceOwner: override.paths[0],
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      sourceHash: region.target.sourceHash,
    },
    behavior: override.behavior,
    evidenceIds: override.evidenceIds,
    sourceMarkers: config.sourceMarkers,
    targetMarkers: config.targetMarkers,
    residues,
  })
}
if (
  JSON.stringify(representationCounts) !==
  JSON.stringify({ 'source-file-ast': 20, 'source-gap-replay': 2 })
) {
  throw new Error(
    `Target119 paired representation counts differ: ${JSON.stringify(representationCounts)}`,
  )
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'authenticated-paired-owner-and-source-gap-replay',
  criterion:
    'exact-target-units-and-residues-plus-sole-source-marker-candidates-and-atomic-paired-source-postimages',
  evidenceIds: TARGET119_SDK_RATE_LIMIT_OWNER_OVERRIDES[0].evidenceIds,
  artifactPhasePolicy: {
    pairing: 'exact-report-and-coverage-descriptor-pair',
    rejectHybridPairs: true,
    rejectUnknownPairs: true,
    acceptedPairs: [
      {
        phase: 'post-rate-owner',
        projection: 'preSourceGap',
        typedAudit: {
          path: '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
          ...preSourceGapReportDescriptor,
        },
        sourceCoverage: {
          path: 'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          bytes: 375_767,
          sha256:
            '9298be0f62522e31e3c47a898e650837f8099efda1eff0470db154ef74ab1020',
        },
        sourceCoverageRaw: {
          bytes: 3_264_637,
          sha256:
            '098a0759188bdf750bfd06c6bc87e616b16b398e4bc104fdffcf49f8e08688e9',
        },
      },
      ...[
        [
          'post-streaming',
          380_714,
          'ad2d435743921b83fb784ff6baf34e1651fc83dc2e31f7680997a3bfd6241654',
          3_283_017,
          '1b47544fc4464cbc437b27133fe03438a2fecb384d4e607118d1a57cb014cc55',
        ],
        [
          'post-u21759',
          382_108,
          '09d6075beeb3174217b97555ddbf67593b72fb5ba9c67e1e143154bd955af810',
          3_290_710,
          '858d4a5dcfb37ce36a43078351ed68dd76c1e565e883617ff451974c2fde1071',
        ],
        [
          'post-u21878',
          383_456,
          '874421d61f40166898113e0967be904859cda7c00493ee57303b97164bbb0015',
          3_297_173,
          '0facb150b84243148609b0e5562484d5d9e5c29f895d03c3a3566484b347b08e',
        ],
      ].map(([phase, bytes, coverageSha256, rawBytes, rawSha256]) => ({
        phase,
        projection: 'finalSourceGap',
        typedAudit: {
          path: '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
          ...finalReportDescriptor,
        },
        sourceCoverage: {
          path: 'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          bytes,
          sha256: coverageSha256,
        },
        sourceCoverageRaw: { bytes: rawBytes, sha256: rawSha256 },
      })),
    ],
  },
  inputs: {
    baselineBundle: {
      artifact: '2.1.118-linux-x64/cli.inner.js',
      ...descriptor(baselineBundle),
    },
    targetBundle: {
      artifact: '2.1.119-linux-x64/cli.inner.js',
      ...descriptor(targetBundle),
    },
    structural: {
      path:
        'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
      ...descriptor(structuralBytes),
    },
    sourceUniverse: {
      release: '2.1.119',
      rejectUnknownProfiles: true,
      acceptedProfiles: [
        {
          profile: 'historical-raw',
          files: universe.length,
          jsonBytes: 67_032,
          sha256:
            '756cb7c544c9c0b244d2d9bfe9af732f99c0acdc8b0ca3cccfb17e2c138d820d',
        },
        {
          profile: 'post-background-agent-replay',
          files: 2_024,
          jsonBytes: 67_081,
          sha256:
            '4ec8f0bf56068881b800e4fbd29915f07caf9f2ed1be9f94deda10ed25faba2e',
        },
      ],
    },
    sourceFiles: CONFIGS.map(config => ({
      path: config.input.path,
      markerCandidates: [config.input.path],
      before: config.input,
      after: config.output,
    })),
  },
  artifactProjections: {
    coverageTupleSchema: [
      'targetIndex',
      'start',
      'end',
      'nodeType',
      'sourceHash',
      'structuralClass',
      'disposition',
      'ownerIds',
      'evidenceIds',
      'behavior',
    ],
    preSourceGap: {
      reportUnits: {
        10175: {
          owner: {
            rows: 67,
            jsonBytes: 31_292,
            sha256:
              'eac7e5b379a1258b3c685a94b71e8dc15969eca49d112efa1484073d05329ba5',
          },
          added: {
            rows: 0,
            jsonBytes: 2,
            sha256:
              '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
          },
          strict: {
            rows: 0,
            jsonBytes: 2,
            sha256:
              '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
          },
        },
        12489: {
          owner: {
            rows: 6,
            jsonBytes: 2_455,
            sha256:
              '260128ceecd32b648e8d02224146ba24263932af0420329215894e649d2ef30d',
          },
          added: {
            rows: 0,
            jsonBytes: 2,
            sha256:
              '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
          },
          strict: {
            rows: 0,
            jsonBytes: 2,
            sha256:
              '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
          },
        },
      },
    },
    finalSourceGap: {
      reportUnits: {
        10175: {
          owner: {
            rows: 68,
            jsonBytes: 31_704,
            sha256:
              '56490139cc3edcd041f1e25b85de6410d364124a382ae665ab03234b4a386dcd',
          },
          added: {
            rows: 1,
            jsonBytes: 3_530,
            sha256:
              '765218fef08200d51cb3b0c17018175ce6d05a369cf93c67ffdaf34ae096abdb',
          },
          strict: {
            rows: 1,
            jsonBytes: 3_530,
            sha256:
              '765218fef08200d51cb3b0c17018175ce6d05a369cf93c67ffdaf34ae096abdb',
          },
        },
        12489: {
          owner: {
            rows: 7,
            jsonBytes: 2_865,
            sha256:
              'c47f1e435eed884d0bb5f8fa0531c438e5053cbf25ba319cc403b7168db74fd1',
          },
          added: {
            rows: 1,
            jsonBytes: 3_634,
            sha256:
              '2dc83dea71ca8a7c6f1ef79a94ac8d66b8bedbc372fb5d6a6cc6b2a405b19871',
          },
          strict: {
            rows: 1,
            jsonBytes: 3_634,
            sha256:
              '2dc83dea71ca8a7c6f1ef79a94ac8d66b8bedbc372fb5d6a6cc6b2a405b19871',
          },
        },
      },
    },
    coverageRows: {
      rows: 2,
      jsonBytes: 1_461,
      sha256:
        'b0bb953d3bc3241791e6fd5261c10ea5b2bc2dbc94cb6e954f6050b9e31b3d21',
    },
    coverageTuples: {
      rows: 2,
      jsonBytes: 1_221,
      sha256:
        '6a65de3bde81d30b96430ac8721ae3155d7fa0221d5d6c6f7aef0688cb3d555e',
    },
  },
  summary: {
    units: rows.length,
    residues: allCanonical.length,
    targetIndicesSha256: sha256(
      JSON.stringify(CONFIGS.map(config => config.targetIndex)),
    ),
    residueIdentitiesSha256: sha256(JSON.stringify(allCanonical)),
    representationCounts,
  },
  sourceReplay: CONFIGS.map(config => ({
    path: config.input.path,
    before: config.before,
    after: config.after,
  })),
  rows,
}

fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ fixturePath, ...fixture.summary })}\n`)
