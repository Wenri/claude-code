#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  TARGET119_MESSAGES_CONTEXT_EVIDENCE_IDS,
  TARGET119_MESSAGES_CONTEXT_OWNER_OVERRIDES,
  buildTarget119MessagesContextOutput,
} from './replay-messages-readonly-skills-context-source-gap.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const targetIndices = [15344, 15351]
const sourcePath = 'src/utils/messages.ts'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-messages-readonly-skills-context-source-gap.json',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function describeFile(filename, extra = {}) {
  return { ...extra, ...descriptor(fs.readFileSync(filename)) }
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function declarationDescriptors(ts, source) {
  const sourceFile = ts.createSourceFile(
    'messages.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const names = new Set(['getReadOnlyToolNames', 'normalizeAttachmentForAPI'])
  const found = []
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.has(statement.name.text)
    ) {
      const start = statement.getStart(sourceFile)
      const end = statement.end
      found.push({
        name: statement.name.text,
        start,
        end,
        ...descriptor(source.slice(start, end)),
      })
    }
  }
  if (found.length !== names.size) {
    throw new Error(`expected ${names.size} declarations, found ${found.length}`)
  }
  return found.sort((left, right) => left.start - right.start)
}

function residueRows(report) {
  return targetIndices.map(targetIndex => {
    const rows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural?.index === targetIndex,
    )
    const expected = targetIndex === 15344 ? 3 : 12
    if (rows.length !== expected) {
      throw new Error(`u${targetIndex}: expected ${expected} residues, found ${rows.length}`)
    }
    return rows.map(row => ({
      kind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineCount: row.baselineOccurrenceCount,
      targetOrdinal: row.targetOccurrenceNumber,
    }))
  })
}

const ts = await loadTypeScript()
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const baselinePath = path.join(
  artifactRoot,
  '2.1.118-linux-x64/cli.inner.js',
)
const targetPath = path.join(
  artifactRoot,
  '2.1.119-linux-x64/cli.inner.js',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const reportPath = path.join(
  root,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const rawSourcePath = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src/utils/messages.ts',
)
const baseline = fs.readFileSync(baselinePath)
const target = fs.readFileSync(targetPath)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const report = JSON.parse(fs.readFileSync(reportPath))
const rawSource = fs.readFileSync(rawSourcePath, 'utf8')
const postSource = buildTarget119MessagesContextOutput(rawSource)
const residues = residueRows(report)

const rows = targetIndices.map((targetIndex, position) => {
  const matches = structural.regions.filter(
    region => region.target.index === targetIndex,
  )
  if (matches.length !== 1) {
    throw new Error(`u${targetIndex}: expected one structural region`)
  }
  const region = matches[0]
  const unit = target.subarray(region.target.start, region.target.end)
  if (sha256(unit) !== region.target.sourceHash) {
    throw new Error(`u${targetIndex}: target unit hash mismatch`)
  }
  return {
    targetIndex,
    role:
      targetIndex === 15344
        ? 'read-only tool-name formatter'
        : 'attachment normalization dispatcher',
    ownerPath: sourcePath,
    declarations:
      targetIndex === 15344
        ? ['getReadOnlyToolNames']
        : ['normalizeAttachmentForAPI'],
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: unit.length,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    residues: residues[position],
  }
})

const canonicalResidues = rows.flatMap(row =>
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
  case: caseName,
  targetVersion: '2.1.119',
  criterion: 'authenticated-messages-readonly-skills-context-source-replay-v1',
  status: 'case-owned-atomic-one-file-source-replay',
  evidenceIds: TARGET119_MESSAGES_CONTEXT_EVIDENCE_IDS,
  inputs: {
    baselineBundle: describeFile(baselinePath, {
      artifact: '2.1.118-linux-x64/cli.inner.js',
    }),
    targetBundle: describeFile(targetPath, {
      artifact: '2.1.119-linux-x64/cli.inner.js',
    }),
    structural: describeFile(structuralPath, {
      path: path.relative(root, structuralPath),
    }),
    sourceCommit: '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05',
    sourceGitObject: '271c867aff51e1b945079b8cac2fc6b2ec5fd572',
    sourcePreimage: { path: sourcePath, ...descriptor(rawSource) },
    sourcePostimage: { path: sourcePath, ...descriptor(postSource) },
  },
  sourceDeclarations: {
    preimage: declarationDescriptors(ts, rawSource),
    postimage: declarationDescriptors(ts, postSource),
  },
  rows,
  ownerOverrides: TARGET119_MESSAGES_CONTEXT_OWNER_OVERRIDES,
  summary: {
    units: rows.length,
    residues: canonicalResidues.length,
    targetIndicesSha256: sha256(JSON.stringify(targetIndices)),
    residueIdentitiesSha256: sha256(JSON.stringify(canonicalResidues)),
  },
}

const output = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (!fs.existsSync(fixturePath)) throw new Error(`missing ${fixturePath}`)
  if (fs.readFileSync(fixturePath, 'utf8') !== output) {
    throw new Error(`fixture is stale: ${fixturePath}`)
  }
} else {
  fs.writeFileSync(fixturePath, output)
}
