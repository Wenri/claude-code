#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET118_SESSIONS_OWNER_OVERRIDES,
  TARGET118_SESSIONS_SOURCE_FILE,
  TARGET118_SESSIONS_SOURCE_TREE,
} from './replay-sessions-owner-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const fixturePath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.118-sessions-owner-source-gap.json',
)
const sourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.118/src',
)
const reportCandidates = [
  path.join(
    repositoryRoot,
    '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
  ),
  '/tmp/late-118-current-report.json',
]
const targetIndex = 19589

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value, extra = {}) {
  return { ...extra, bytes: value.length, sha256: sha256(value) }
}

function nameOfAcornKey(key) {
  if (key?.type === 'Identifier' || key?.type === 'PrivateIdentifier') {
    return key.name
  }
  if (key?.type === 'Literal') return String(key.value)
  return undefined
}

function targetClassSurface(unit) {
  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
  if (ast.body.length !== 1 || ast.body[0].type !== 'ClassDeclaration') {
    throw new Error(`u${targetIndex}: expected one class declaration`)
  }
  const fields = []
  const methods = []
  for (const member of ast.body[0].body.body) {
    const name = nameOfAcornKey(member.key)
    if (name === undefined) continue
    if (member.type === 'PropertyDefinition') fields.push(name)
    if (member.type === 'MethodDefinition') methods.push(name)
  }
  return { fields, methods }
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function sourceClassAudit(ts, filename) {
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`${filename}: TypeScript parse diagnostics`)
  }
  const matches = []
  function visit(node) {
    if (
      ts.isClassDeclaration(node) &&
      declarationName(ts, node) === 'SessionsWebSocket'
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (matches.length !== 1) {
    throw new Error(`${filename}: expected one SessionsWebSocket class`)
  }
  const declaration = matches[0]
  const text = source.slice(declaration.getStart(sourceFile), declaration.end)
  const explicitFields = []
  const parameterFields = []
  const methods = []
  for (const member of declaration.members) {
    if (ts.isPropertyDeclaration(member) && member.name) {
      explicitFields.push(declarationName(ts, member))
    } else if (ts.isConstructorDeclaration(member)) {
      for (const parameter of member.parameters) {
        if (
          parameter.modifiers?.some(modifier =>
            [
              ts.SyntaxKind.PrivateKeyword,
              ts.SyntaxKind.ProtectedKeyword,
              ts.SyntaxKind.PublicKeyword,
              ts.SyntaxKind.ReadonlyKeyword,
            ].includes(modifier.kind),
          ) &&
          ts.isIdentifier(parameter.name)
        ) {
          parameterFields.push(parameter.name.text)
        }
      }
      methods.push('constructor')
    } else if (ts.isMethodDeclaration(member) && member.name) {
      methods.push(declarationName(ts, member))
    }
  }
  return {
    file: descriptor(bytes),
    declaration: {
      kind: 'ClassDeclaration',
      name: 'SessionsWebSocket',
      start: declaration.getStart(sourceFile),
      end: declaration.end,
      ...descriptor(Buffer.from(text)),
    },
    surface: {
      fields: [...parameterFields, ...explicitFields],
      methods,
    },
  }
}

function normalizeResidue(row) {
  return {
    kind: row.literalKind,
    value: row.value,
    identitySha256: sha256(
      Buffer.from(JSON.stringify([row.literalKind, row.value])),
    ),
    start: row.target.start,
    end: row.target.end,
    baselineCount: row.baselineOccurrenceCount,
    targetOrdinal: row.targetOccurrenceNumber,
  }
}

const baselineBundlePath = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
)
const targetBundlePath = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz',
)
const helperPath = path.join(
  repositoryRoot,
  'recovery/cases/2.1.117-to-2.1.118/recovered/replay-sessions-owner-source-gap.mjs',
)
const reportPath = reportCandidates.find(fs.existsSync)
if (!reportPath) throw new Error('Target118 typed owner-residue report is absent')

const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const region = structural.regions.find(row => row.target.index === targetIndex)
if (!region) throw new Error(`u${targetIndex}: structural region is absent`)
const targetUnit = targetBundle
  .subarray(region.target.start, region.target.end)
  .toString('utf8')
if (sha256(targetUnit) !== region.target.sourceHash) {
  throw new Error(`u${targetIndex}: target unit hash mismatch`)
}
const report = JSON.parse(fs.readFileSync(reportPath))
const reportRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
  row => row.structural.index === targetIndex,
)
if (reportRows.length !== 110) {
  throw new Error(`u${targetIndex}: expected 110 provisional residues`)
}
const residues = reportRows.map(normalizeResidue)
const candidateUniverse = [
  ...new Set(
    reportRows.flatMap(row => row.candidates).map(candidate =>
      candidate.startsWith('../src/') ? candidate.slice(3) : candidate,
    ),
  ),
].sort()
const ts = await loadTypeScript()
const sourceAudit = sourceClassAudit(
  ts,
  path.join(sourceRoot, TARGET118_SESSIONS_SOURCE_FILE.path.slice(4)),
)
const helperBytes = fs.readFileSync(helperPath)
const override = TARGET118_SESSIONS_OWNER_OVERRIDES[0]

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  criterion: 'target118-complete-class-exact-source-owner-v1',
  status: 'case-owned-owner-replay-ready',
  inputs: {
    baselineBundle: descriptor(baselineBundle, {
      artifact: '2.1.117-linux-x64/cli.inner.js',
    }),
    targetBundle: descriptor(targetBundle, {
      artifact: '2.1.118-linux-x64/cli.inner.js',
    }),
    structural: descriptor(structuralBytes, {
      path:
        'recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz',
    }),
    sourceTree: TARGET118_SESSIONS_SOURCE_TREE,
  },
  summary: {
    units: 1,
    residues: residues.length,
    uniqueResidueIdentities: new Set(
      residues.map(row => row.identitySha256),
    ).size,
    exactSourceDeclarations: 1,
    rejectedCoarseOwners: 1,
  },
  replay: {
    helper: descriptor(helperBytes, {
      path:
        'recovery/cases/2.1.117-to-2.1.118/recovered/replay-sessions-owner-source-gap.mjs',
    }),
    ownerOverride: override,
    sourceFile: {
      ...TARGET118_SESSIONS_SOURCE_FILE,
      ...sourceAudit,
    },
  },
  proof: {
    targetIndex,
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    targetClassSurface: targetClassSurface(targetUnit),
    provisionalOwnerPaths: [
      ...new Set(reportRows.flatMap(row => row.ownerPaths)),
    ].sort(),
    candidateUniverse,
    residues,
    residueIdentitiesSha256: sha256(Buffer.from(JSON.stringify(residues))),
  },
}

const serialized = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--write')) {
  fs.writeFileSync(fixturePath, serialized)
} else {
  process.stdout.write(serialized)
}
