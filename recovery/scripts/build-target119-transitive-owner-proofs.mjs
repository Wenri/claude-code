import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const analysisPath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
)
const reportPath = path.join(
  repositoryRoot,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const sourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const targetBundlePath = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
)
const outputPath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.119-transitive-owner-proofs.json',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function fail(message) {
  throw new Error(message)
}

function normalizedPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\.\/src\//, '').replace(/^src\//, '')
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${canonicalFlags(value.flags)}`
  }
  return `${kind}:${
    kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)
  }`
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '[') {
      inClass = true
      continue
    }
    if (character === ']' && inClass) {
      inClass = false
      continue
    }
    if (character === '/' && !inClass) {
      return {
        flags: canonicalFlags(text.slice(index + 1)),
        pattern: text.slice(1, index),
      }
    }
  }
  return null
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  if (!fs.existsSync(filename)) fail('the repository-pinned TypeScript compiler is required')
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function collectIdentities(ts, node, sourceFile) {
  const identities = new Set()
  function add(kind, value) {
    identities.add(identity(kind, value))
  }
  function visit(child) {
    if (ts.isStringLiteralLike(child) || ts.isTemplateLiteralToken(child)) {
      add('string', child.text)
    } else if (ts.isJsxText(child)) {
      const lines = child.text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        let line = lines[index].replace(/\t/g, ' ')
        if (index !== 0) line = line.replace(/^ +/, '')
        if (index !== lines.length - 1) line = line.replace(/ +$/, '')
        if (line) add('string', line)
      }
      const collapsed = child.text.replace(/\s+/g, ' ').trim()
      if (collapsed) add('string', collapsed)
    } else if (ts.isNumericLiteral(child)) {
      add('number', Number(child.text.replaceAll('_', '')))
    } else if (ts.isBigIntLiteral(child)) {
      add('bigint', child.text.replace(/n$/, ''))
    } else if (ts.isRegularExpressionLiteral(child)) {
      const value = parseRegExp(child.getText(sourceFile))
      if (value) add('regexp', value)
    }

    const property =
      (ts.isPropertyAssignment(child) ||
        ts.isShorthandPropertyAssignment(child) ||
        ts.isMethodDeclaration(child) ||
        ts.isGetAccessorDeclaration(child) ||
        ts.isSetAccessorDeclaration(child) ||
        ts.isPropertyDeclaration(child) ||
        ts.isPropertySignature(child) ||
        ts.isMethodSignature(child) ||
        ts.isBindingElement(child) ||
        ts.isJsxAttribute(child)) &&
      child.name &&
      ts.isIdentifier(child.name)
        ? child.name.text
        : ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.name)
          ? child.name.text
          : null
    if (property) add('property', property)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return identities
}

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map(declaration =>
        ts.isIdentifier(declaration.name) ? declaration.name.text : '<binding>',
      )
      .join(',')
  }
  return null
}

function isDeclarationScope(ts, node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isVariableStatement(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  )
}

function sourceProof(ts, relativePath, expectedIdentities) {
  const filename = path.join(sourceRoot, relativePath)
  if (!fs.existsSync(filename)) fail(`${relativePath}: target119 source owner is missing`)
  const bytes = fs.readFileSync(filename)
  const result = {
    path: `src/${relativePath}`,
    ...descriptor(bytes),
    proofScope: 'file',
    declaration: null,
  }
  if (!/\.[cm]?[jt]sx?$/.test(relativePath)) {
    const source = bytes.toString('utf8')
    for (const expected of expectedIdentities) {
      if (!expected.startsWith('string:')) {
        fail(`${relativePath}: non-code owner has non-string residue ${expected}`)
      }
      if (!source.includes(JSON.parse(expected.slice('string:'.length)))) {
        fail(`${relativePath}: non-code owner omits ${expected}`)
      }
    }
    result.proofScope = 'resource'
    return result
  }

  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') || relativePath.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    fail(`${relativePath}: target119 source owner does not parse`)
  }
  const fileIdentities = collectIdentities(ts, sourceFile, sourceFile)
  for (const expected of expectedIdentities) {
    if (!fileIdentities.has(expected)) fail(`${relativePath}: source AST omits ${expected}`)
  }

  const candidates = []
  function visit(node) {
    const name = declarationName(ts, node)
    if (name && isDeclarationScope(ts, node)) {
      const identities = collectIdentities(ts, node, sourceFile)
      if ([...expectedIdentities].every(value => identities.has(value))) {
        const start = node.getStart(sourceFile)
        const end = node.end
        candidates.push({
          bytes: end - start,
          end,
          kind: ts.SyntaxKind[node.kind],
          name,
          sha256: sha256(Buffer.from(source.slice(start, end))),
          start,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  candidates.sort(
    (left, right) =>
      left.bytes - right.bytes || left.start - right.start || left.name.localeCompare(right.name),
  )
  if (candidates.length > 0) {
    result.proofScope = 'declaration'
    result.declaration = candidates[0]
  }
  return result
}

const analysisBytes = fs.readFileSync(analysisPath)
const reportBytes = fs.readFileSync(reportPath)
const targetBundle = fs.readFileSync(targetBundlePath)
const analysis = JSON.parse(analysisBytes)
const report = JSON.parse(reportBytes)
const priorFixture = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : null
const postCorrectionUnsafe = new Map([
  [
    16557,
    'Correcting the coarse dependencyResolver owner exposes eleven additional plugin-update residues whose sole exact owner is services/plugins/pluginOperations.ts.',
  ],
  [
    18458,
    'Correcting the coarse owner to daemon/auth.ts exposes fourteen bridge/debug residues distributed across other modules, so the complete unit lacks one exact owner.',
  ],
  [
    20626,
    'Correcting the coarse owner to screens/REPL.tsx exposes three generic control-state residues with no declaration-local sole owner.',
  ],
])
const allMappings = analysis.analysis.sourceGapReplay.transitiveExactConsensus.mappings
const mappings = allMappings.filter(mapping => !postCorrectionUnsafe.has(mapping.targetIndex))
const macroValues = new Set(Object.values(analysis.macro))
const ts = await loadTypeScript()

if (analysis.case !== '2.1.118-to-2.1.119') fail('target119 analysis case differs')
if (allMappings.length !== 200) {
  fail(`expected 200 provisional target119 transitive mappings, got ${allMappings.length}`)
}
if (mappings.length !== 197) {
  fail(`expected 197 closed target119 transitive mappings, got ${mappings.length}`)
}

const sourceOwners = new Map()
const rows = mappings.map(mapping => {
  let residues = report.sourceRuntimeAddedOwnerResidueRows.filter(
    residue => residue.structural.index === mapping.targetIndex,
  )
  let usedPinnedCanonicalResidues = false
  if (residues.length !== mapping.residues) {
    const pinned = priorFixture?.rows?.find(row => row.targetIndex === mapping.targetIndex)
    if (pinned?.residues?.length === mapping.residues) {
      residues = pinned.residues.map(residue => ({
        baselineOccurrenceCount: residue.baselineOccurrenceCount,
        literalKind: residue.kind,
        sourceMatches: [mapping.replaySourcePath],
        structural: { index: mapping.targetIndex },
        target: { end: residue.targetEnd, start: residue.targetStart },
        targetOccurrenceNumber: residue.targetOccurrenceNumber,
        value: residue.value,
      }))
      usedPinnedCanonicalResidues = true
    }
  }
  if (residues.length !== mapping.residues) {
    fail(
      `u${mapping.targetIndex}: expected ${mapping.residues} residues, got ${residues.length}`,
    )
  }
  const nonMacro = residues.filter(
    residue => !(residue.literalKind === 'string' && macroValues.has(residue.value)),
  )
  if (nonMacro.length === 0) fail(`u${mapping.targetIndex}: transitive unit is macro-only`)
  const commonPaths = nonMacro
    .map(residue => new Set(residue.sourceMatches.map(normalizedPath)))
    .reduce(
      (common, paths) => new Set([...common].filter(candidate => paths.has(candidate))),
    )
  if (commonPaths.size !== 1 || !commonPaths.has(mapping.replaySourcePath)) {
    fail(`u${mapping.targetIndex}: exact-consensus owner relation differs`)
  }
  if (usedPinnedCanonicalResidues) {
    const pinned = priorFixture.rows.find(row => row.targetIndex === mapping.targetIndex)
    if (pinned.ownerPath !== `src/${mapping.replaySourcePath}`) {
      fail(`u${mapping.targetIndex}: pinned exact-consensus owner differs`)
    }
  }
  const expectedIdentities = new Set(
    nonMacro.map(residue => identity(residue.literalKind, residue.value)),
  )
  const owner = sourceProof(ts, mapping.replaySourcePath, expectedIdentities)
  const priorOwner = sourceOwners.get(owner.path)
  if (priorOwner && (priorOwner.bytes !== owner.bytes || priorOwner.sha256 !== owner.sha256)) {
    fail(`${owner.path}: source owner identity differs across units`)
  }
  sourceOwners.set(owner.path, {
    bytes: owner.bytes,
    path: owner.path,
    sha256: owner.sha256,
  })
  const target = targetBundle.subarray(mapping.target.start, mapping.target.end)
  if (sha256(target) !== mapping.target.sourceHash) {
    fail(`u${mapping.targetIndex}: authenticated target slice hash differs`)
  }
  return {
    targetIndex: mapping.targetIndex,
    behavior:
      `Authenticated target119 unit u${mapping.targetIndex} is represented by the exact ` +
      `${owner.proofScope} AST/resource owner ${owner.path}; every non-macro residue shares ` +
      'that sole exact target119 source path.',
    ownerPath: owner.path,
    ownerProof: owner,
    priorClaimedOwnerPaths: mapping.currentOwnerPaths.map(value => `src/${value}`),
    target: {
      classification: mapping.target.classification,
      end: mapping.target.end,
      nodeType: mapping.target.nodeType,
      sha256: mapping.target.sourceHash,
      start: mapping.target.start,
    },
    residues: residues.map(residue => ({
      baselineOccurrenceCount: residue.baselineOccurrenceCount,
      kind: residue.literalKind,
      macro:
        residue.literalKind === 'string' && macroValues.has(residue.value)
          ? Object.entries(analysis.macro).find(([, value]) => value === residue.value)?.[0] ?? true
          : false,
      targetEnd: residue.target.end,
      targetOccurrenceNumber: residue.targetOccurrenceNumber,
      targetStart: residue.target.start,
      value: residue.value,
    })),
  }
})

const fixture = {
  schemaVersion: 1,
  case: analysis.case,
  status: 'generator-ready-fail-closed',
  criterion: 'target119-whole-unit-sole-source-consensus-with-ast-scope-v1',
  versions: analysis.versions,
  inputs: {
    analysis: { path: path.relative(repositoryRoot, analysisPath), ...descriptor(analysisBytes) },
    canonicalPreCorrectionReport: descriptor(reportBytes),
    targetBundle: descriptor(targetBundle),
  },
  evidenceIds: [
    'target119-transitive-owner-target-fragment',
    'target119-transitive-owner-source-ast-test',
  ],
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    macroResidues: rows.reduce(
      (sum, row) => sum + row.residues.filter(residue => residue.macro).length,
      0,
    ),
    declarationUnits: rows.filter(row => row.ownerProof.proofScope === 'declaration').length,
    fileUnits: rows.filter(row => row.ownerProof.proofScope === 'file').length,
    resourceUnits: rows.filter(row => row.ownerProof.proofScope === 'resource').length,
    ownerFiles: sourceOwners.size,
    excludedIncompleteUnits: postCorrectionUnsafe.size,
  },
  excludedIncompleteRows: [...postCorrectionUnsafe].map(([targetIndex, reason]) => ({
    reason,
    targetIndex,
  })),
  sourceOwners: [...sourceOwners.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  ),
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(`${path.relative(repositoryRoot, outputPath)} ${JSON.stringify(fixture.summary)}\n`)
