import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated target110 and target111 bundles are required'
      : false,
}

const units = new Map([
  [11383, ['FunctionDeclaration', 8636700, 8640399, 'e5662df5eab77463b5d1df975ad524cb0c3b59557d50fd6cee269cb045404918']],
  [11388, ['FunctionDeclaration', 8641141, 8643963, '96abe6223b048a3914350eed49893000fed4aed241a0006ce5de7033593cb7a8']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('target111 authenticates document versions and stale-diagnostic filtering', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
  assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [nodeType, start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
      [nodeType, start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  assert.equal(occurrences(baseline, 'getDocumentVersion'), 0)
  assert.equal(occurrences(target, 'getDocumentVersion'), 2)
  assert.equal(occurrences(baseline, 'LSP Diagnostics: Dropping stale publishDiagnostics from '), 0)
  assert.equal(occurrences(target, 'LSP Diagnostics: Dropping stale publishDiagnostics from '), 1)
  assert.match(
    target.slice(8636700, 8640399),
    /didOpen.*version:.*didChange.*version:.*didClose.*delete.*getDocumentVersion/s,
  )
  assert.match(
    target.slice(8641141, 8643963),
    /version!==.*getDocumentVersion.*version<.*Dropping stale publishDiagnostics/s,
  )
})

test('source owns monotonic version lifecycle and filters only stale diagnostics', sourceOptions, () => {
  const manager = fs.readFileSync(path.join(sourceRoot, 'services/lsp/LSPServerManager.ts'), 'utf8')
  const passive = fs.readFileSync(path.join(sourceRoot, 'services/lsp/passiveFeedback.ts'), 'utf8')

  for (const fragment of [
    'const documentVersions: Map<string, number> = new Map()',
    'const version = (documentVersions.get(uri) ?? 0) + 1',
    'version: nextDocumentVersion(fileUri)',
    'const version = nextDocumentVersion(fileUri)',
    'documentVersions.delete(fileUri)',
    'documentVersions.clear()',
    'function getDocumentVersion(uri: string): number | undefined',
    'getDocumentVersion,',
  ]) {
    assert.ok(manager.includes(fragment), `LSPServerManager.ts: ${fragment}`)
  }
  assert.match(
    passive,
    /diagnosticParams\.version !== undefined[\s\S]*manager\.getDocumentVersion\([\s\S]*diagnosticParams\.version < currentVersion[\s\S]*Dropping stale publishDiagnostics/,
  )

  const versions = new Map()
  const next = uri => {
    const version = (versions.get(uri) ?? 0) + 1
    versions.set(uri, version)
    return version
  }
  assert.deepEqual([next('file:///a.ts'), next('file:///a.ts'), next('file:///b.ts')], [1, 2, 1])
  const current = versions.get('file:///a.ts')
  assert.equal(1 < current, true)
  assert.equal(2 < current, false)
  versions.delete('file:///a.ts')
  assert.equal(versions.get('file:///a.ts'), undefined)
})
