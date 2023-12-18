import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from '../../../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_EXTRA_USAGE_EVIDENCE_IDS,
  TARGET121_EXTRA_USAGE_OWNER_OVERRIDES,
} from './extra-usage-owner-overrides.mjs'

const root = process.cwd()
const targetIndices = Object.freeze(
  TARGET121_EXTRA_USAGE_OWNER_OVERRIDES.map(row => row.targetIndex),
)
const targetIndexSet = new Set(targetIndices)
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.121-linux-x64/cli.inner.js',
)
const baselineBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.120-linux-x64/cli.inner.js',
)
const allOwnersPath = path.join(
  root,
  '.recovery-tmp/generator-inputs/2.1.120-to-2.1.121.all-owners.json',
)
const typedReportPath =
  process.env.CLAUDE_CODE_2_1_121_TYPED_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.120-to-2.1.121.typed-audit.json',
  )
const sourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.121/src',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const canonicalValue = value =>
  value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value
const canonicalResidue = row => [
  row.structural.index,
  row.literalKind,
  canonicalValue(row.value),
  row.target.start,
  row.target.end,
  row.baselineOccurrenceCount,
  row.targetOccurrenceNumber,
  row.structural.sourceHash,
]
const canonicalDigest = rows =>
  sha256(Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8'))

const targetBundle = fs.readFileSync(targetBundlePath)
const baselineBundle = fs.readFileSync(baselineBundlePath)
const allOwners = JSON.parse(fs.readFileSync(allOwnersPath, 'utf8'))
const report = JSON.parse(fs.readFileSync(typedReportPath, 'utf8'))
const units = allOwners.rows
  .filter(row => targetIndexSet.has(row.targetIndex))
  .sort((a, b) => a.targetIndex - b.targetIndex)
  .map(row => ({
    targetIndex: row.targetIndex,
    start: row.start,
    end: row.end,
    nodeType: row.nodeType,
    sourceHash: row.sourceHash,
    bytes: row.end - row.start,
    targetSliceSha256: sha256(targetBundle.subarray(row.start, row.end)),
  }))
if (units.length !== targetIndices.length) {
  throw new Error(`expected ${targetIndices.length} extra-usage units, got ${units.length}`)
}
const residues = report.sourceRuntimeAddedOwnerResidueRows
  .filter(row => targetIndexSet.has(row.structural.index))
  .map(canonicalResidue)
  .sort((a, b) => a[0] - b[0] || a[3] - b[3] || a[4] - b[4])
if (residues.length !== 358) {
  throw new Error(`expected 358 extra-usage residues, got ${residues.length}`)
}

const sourceSpecs = [
  {
    path: 'src/services/api/extraUsage.ts',
    declarations: [
      'setExtraUsageSpendLimit',
      'setExtraUsageAutoReload',
      'fetchExtraUsageBalance',
      'fetchExtraUsageBundles',
      'purchaseExtraUsage',
      'fetchExtraUsageTaxPreview',
      'fetchExtraUsagePurchaseStatus',
    ],
  },
  {
    path: 'src/commands/extra-usage/ExtraUsageDialog.tsx',
    declarations: ['ExtraUsageDialog', 'BuySelect', 'AmountInput', 'AutoReload'],
  },
]
const tsImport = await import(
  pathToFileURL(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href
)
const ts = tsImport.default ?? tsImport
const sourceFiles = []
for (const spec of sourceSpecs) {
  const absolutePath = path.join(sourceRoot, spec.path.slice(4))
  const bytes = fs.readFileSync(absolutePath)
  const text = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    absolutePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    absolutePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const declarations = []
  function visit(node) {
    if (
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      spec.declarations.includes(node.name.text) &&
      (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
    ) {
      const start = node.getStart(sourceFile)
      const end = node.end
      declarations.push({
        name: node.name.text,
        start,
        end,
        bytes: end - start,
        sha256: sha256(bytes.subarray(start, end)),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  declarations.sort((a, b) => a.start - b.start)
  if (
    declarations.length !== spec.declarations.length ||
    spec.declarations.some(
      name => declarations.filter(row => row.name === name).length !== 1,
    )
  ) {
    throw new Error(`${spec.path} declarations differ`)
  }
  sourceFiles.push({
    path: spec.path,
    ...descriptor(bytes),
    declarations,
  })
}

const targetText = targetBundle.toString('utf8')
const targetAst = parse(targetText, {
  allowHashBang: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
})
const mockGetters = []
const mockIdentifiers = []
const mockCalls = []
function walk(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child)
    return
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'hT') {
    mockGetters.push(node)
  }
  if (node.type === 'Identifier' && node.name === 'hT') {
    mockIdentifiers.push(node.start)
  }
  if (node.type === 'CallExpression' && node.callee?.name === 'hT') {
    mockCalls.push(node.callee.start)
  }
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child)
  }
}
walk(targetAst)
if (mockGetters.length !== 1) throw new Error('target mock getter differs')
const getter = mockGetters[0]
if (
  getter.body.body.length !== 1 ||
  getter.body.body[0].type !== 'ReturnStatement' ||
  getter.body.body[0].argument?.type !== 'Literal' ||
  getter.body.body[0].argument.value !== null
) {
  throw new Error('target mock getter is not the exact always-null binding')
}
const presetDeclaration = allOwners.rows.find(row => row.targetIndex === 12690)
if (presetDeclaration === undefined) {
  throw new Error('target mock preset declaration differs')
}

const unitScopes = {
  12681: ['setExtraUsageSpendLimit'],
  12682: ['setExtraUsageAutoReload'],
  12683: ['fetchExtraUsageBalance'],
  12684: ['disabledMockBundleBuilder'],
  12685: ['fetchExtraUsageBundles'],
  12687: ['purchaseExtraUsage'],
  12688: ['fetchExtraUsageTaxPreview'],
  12689: ['fetchExtraUsagePurchaseStatus'],
  12691: ['disabledMockBundlePresets'],
  12699: ['ExtraUsageDialog'],
  12704: ['BuySelect'],
  12708: ['ExtraUsageDialog', 'AmountInput'],
  12712: ['AutoReload'],
  12716: ['AmountInput'],
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.120-to-2.1.121',
  targetVersion: '2.1.121',
  baselineBundle: {
    path: path.relative(root, baselineBundlePath),
    ...descriptor(baselineBundle),
  },
  targetBundle: {
    path: path.relative(root, targetBundlePath),
    ...descriptor(targetBundle),
  },
  targetIndices,
  targetIndicesSha256: sha256(Buffer.from(`${JSON.stringify(targetIndices)}\n`)),
  units,
  residues,
  summary: {
    units: units.length,
    residues: residues.length,
    residueIdentitiesSha256: canonicalDigest(residues),
    apiUnits: 9,
    dialogUnits: 5,
    disabledMockUnits: 10,
  },
  sourceFiles,
  unitScopes,
  disabledMockBinding: {
    name: 'hT',
    start: getter.start,
    end: getter.end,
    ...descriptor(targetBundle.subarray(getter.start, getter.end)),
    identifierOffsets: mockIdentifiers.sort((a, b) => a - b),
    callOffsets: mockCalls.sort((a, b) => a - b),
    presetDeclaration: {
      start: presetDeclaration.start,
      end: presetDeclaration.end,
      ...descriptor(
        targetBundle.subarray(presetDeclaration.start, presetDeclaration.end),
      ),
    },
    guardedTargetIndices: [
      12681,
      12682,
      12683,
      12684,
      12685,
      12687,
      12688,
      12689,
      12691,
      12699,
    ],
  },
  evidenceIds: [...TARGET121_EXTRA_USAGE_EVIDENCE_IDS],
  ownerOverrides: TARGET121_EXTRA_USAGE_OWNER_OVERRIDES,
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
