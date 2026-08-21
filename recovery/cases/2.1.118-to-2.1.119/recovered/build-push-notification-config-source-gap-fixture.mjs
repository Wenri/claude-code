#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  buildTarget119PushNotificationConfigOutput,
  TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS,
  TARGET119_PUSH_NOTIFICATION_CONFIG_FILES,
  TARGET119_PUSH_NOTIFICATION_CONFIG_OWNER_OVERRIDES,
} from './replay-push-notification-config-source-gap.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
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
  'recovery/test/recovery-2.1.119-push-notification-config-source-gap.json',
)
const declarationNames = new Map([
  [18156, 'shouldShowPushNotificationIdleUpsell'],
  [18157, 'isPushNotificationTipRelevant'],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceDeclaration(ts, relative, source, name) {
  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`${relative}: TypeScript parse diagnostics`)
  }
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  if (matches.length !== 1) {
    throw new Error(`${relative}: ${name} declaration is not unique`)
  }
  const declaration = matches[0]
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  const text = source.slice(start, end)
  if (
    !text.includes("getConfigValue('agentPushNotifEnabled', false).value") ||
    text.includes('config.agentPushNotifEnabled')
  ) {
    throw new Error(`${relative}: ${name} config replay is absent`)
  }
  return {
    kind: 'FunctionDeclaration',
    name,
    start,
    end,
    bytes: end - start,
    sha256: sha256(text),
    requiredMarkers: [
      "getConfigValue('agentPushNotifEnabled', false).value !== true",
      "'tengu_kairos_push_notifications'",
    ],
  }
}

const report = JSON.parse(fs.readFileSync(reportPath))
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString('utf8')
const ts = await loadTypeScript()

const frozenRows = fs.existsSync(fixturePath)
  ? new Map(
      JSON.parse(fs.readFileSync(fixturePath)).rows.map(row => [
        row.targetIndex,
        row,
      ]),
    )
  : new Map()
const liveRows = new Map()
for (const row of report.sourceRuntimeAddedOwnerResidueRows) {
  if (!declarationNames.has(row.structural.index)) continue
  const rows = liveRows.get(row.structural.index) ?? []
  rows.push(row)
  liveRows.set(row.structural.index, rows)
}
const counts = [...declarationNames].map(
  ([targetIndex]) => (liveRows.get(targetIndex) ?? []).length,
)
const provisionalState = JSON.stringify(counts) === JSON.stringify([1, 1])
const correctedState = counts.every(count => count === 0)
if (!provisionalState && !correctedState) {
  throw new Error(
    `Target119 push-notification scanner is partial: ${counts.join(',')}`,
  )
}
if (correctedState && frozenRows.size !== 2) {
  throw new Error('post-correction regeneration requires the frozen fixture')
}

const sourceInputs = new Map()
const sourceOutputs = new Map()
for (const file of TARGET119_PUSH_NOTIFICATION_CONFIG_FILES) {
  const filename = path.join(sourceRoot, file.path.replace(/^src\//, ''))
  const input = fs.readFileSync(filename)
  if (
    input.length !== file.input.bytes ||
    sha256(input) !== file.input.sha256
  ) {
    throw new Error(`${file.path}: fixture builder requires raw source`)
  }
  const output = Buffer.from(
    buildTarget119PushNotificationConfigOutput(input.toString('utf8'), file),
  )
  if (
    output.length !== file.output.bytes ||
    sha256(output) !== file.output.sha256
  ) {
    throw new Error(`${file.path}: postimage descriptor differs`)
  }
  sourceInputs.set(file.path, input)
  sourceOutputs.set(file.path, output)
}

const targetAst = parse(targetText, {
  ecmaVersion: 'latest',
  sourceType: 'module',
})
const configGetterMatches = targetAst.body.filter(
  node => node.type === 'FunctionDeclaration' && node.id?.name === 'T5',
)
if (configGetterMatches.length !== 1) {
  throw new Error('Target119 settings-backed config getter is not unique')
}
const configGetterNode = configGetterMatches[0]
const configGetterText = targetText.slice(
  configGetterNode.start,
  configGetterNode.end,
)
for (const marker of [
  'source:"legacyGlobalConfig"',
  'source:"default"',
  'return{value:',
]) {
  if (!configGetterText.includes(marker)) {
    throw new Error(`Target119 config getter marker absent: ${marker}`)
  }
}

const rows = []
for (const override of TARGET119_PUSH_NOTIFICATION_CONFIG_OWNER_OVERRIDES) {
  const targetIndex = override.targetIndex
  const region = regions.get(targetIndex)
  const targetUnit = targetText.slice(region.target.start, region.target.end)
  if (sha256(targetUnit) !== region.target.sourceHash) {
    throw new Error(`u${targetIndex}: target unit hash differs`)
  }
  for (const marker of ['T5("agentPushNotifEnabled",!1).value', 'P5H()']) {
    if (!targetUnit.includes(marker)) {
      throw new Error(`u${targetIndex}: target marker absent: ${marker}`)
    }
  }
  const reportRows = provisionalState
    ? liveRows.get(targetIndex)
    : frozenRows.get(targetIndex).residues.map(residue => ({
        literalKind: residue.kind,
        value: residue.value,
        target: { start: residue.start, end: residue.end },
        baselineOccurrenceCount: residue.baselineCount,
        targetOccurrenceNumber: residue.targetOrdinal,
      }))
  if (
    reportRows.length !== 1 ||
    reportRows[0].literalKind !== 'string' ||
    reportRows[0].value !== 'agentPushNotifEnabled'
  ) {
    throw new Error(`u${targetIndex}: exact config-key residue differs`)
  }
  const sourcePath = override.paths[0]
  const source = sourceOutputs.get(sourcePath).toString('utf8')
  rows.push({
    targetIndex,
    ownerPath: sourcePath,
    priorOwnerPaths: ['src/components/RemoteCallout.tsx'],
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      sourceHash: region.target.sourceHash,
      requiredMarkers: [
        'T5("agentPushNotifEnabled",!1).value',
        'P5H()',
      ],
    },
    declaration: sourceDeclaration(
      ts,
      sourcePath,
      source,
      declarationNames.get(targetIndex),
    ),
    residues: reportRows.map(row => ({
      kind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineCount: row.baselineOccurrenceCount,
      targetOrdinal: row.targetOccurrenceNumber,
    })),
    behavior: override.behavior,
  })
}

const identities = rows.flatMap(row =>
  row.residues.map(residue => [
    row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ]),
)
const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'bounded-push-notification-config-source-replay-ready',
  criterion:
    'authenticated-settings-backed-config-getter-and-two-source-declaration-replay-v1',
  evidenceIds: TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS,
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
    sourceFiles: TARGET119_PUSH_NOTIFICATION_CONFIG_FILES,
  },
  targetConfigGetter: {
    name: 'T5',
    start: configGetterNode.start,
    end: configGetterNode.end,
    bytes: configGetterNode.end - configGetterNode.start,
    sha256: sha256(configGetterText),
    requiredMarkers: [
      'source:"legacyGlobalConfig"',
      'source:"default"',
      'return{value:',
    ],
  },
  summary: {
    units: 2,
    residues: 2,
    targetIndicesSha256: sha256(
      Buffer.from(JSON.stringify(rows.map(row => row.targetIndex))),
    ),
    residueIdentitiesSha256: sha256(
      Buffer.from(JSON.stringify(identities)),
    ),
  },
  ownerOverrides: TARGET119_PUSH_NOTIFICATION_CONFIG_OWNER_OVERRIDES,
  rows,
}

const value = `${JSON.stringify(fixture, null, 2)}\n`
if (correctedState || process.argv.includes('--check')) {
  if (!fs.existsSync(fixturePath) || fs.readFileSync(fixturePath, 'utf8') !== value) {
    throw new Error('frozen push-notification fixture differs')
  }
} else {
  fs.writeFileSync(fixturePath, value)
}
process.stdout.write(`${fixturePath} ${JSON.stringify(fixture.summary)}\n`)
