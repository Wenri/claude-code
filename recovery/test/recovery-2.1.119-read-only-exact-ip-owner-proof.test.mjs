import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_READ_ONLY_EXACT_IP_EVIDENCE_IDS,
  TARGET119_READ_ONLY_EXACT_IP_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/read-only-exact-ip-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-read-only-exact-ip-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/read-only-exact-ip-owner-overrides.mjs',
)
const coveragePath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '204c83db5e4f0f5f1dee70492de53ae93ecadfd28e0d31f334356d2ae3e10d6f'
const HELPER_SHA256 =
  '0d3293a581032fe4761763ae0b35e54c62441d9f71422bee73650468caae85d4'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
}

function compiledRepresentations(unitText) {
  const tree = parse(unitText, { ecmaVersion: 'latest', sourceType: 'script' })
  const tupleMatches = []
  const regexMatches = []
  walk(tree, node => {
    if (node.type === 'ArrayExpression') {
      const value = node.elements?.map(pair =>
        pair?.type === 'ArrayExpression'
          ? pair.elements?.map(element => element?.value)
          : undefined,
      )
      if (JSON.stringify(value) === JSON.stringify(fixture.representation.argvTuple)) {
        tupleMatches.push(node)
      }
    }
    if (
      node.type === 'Literal' &&
      node.regex?.pattern === '^ip addr$' &&
      node.regex?.flags === ''
    ) {
      regexMatches.push(node)
    }
  })
  return { tupleMatches, regexMatches }
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function declarationName(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) return statement.name?.text
  if (!ts.isVariableStatement(statement)) return undefined
  const declarations = statement.declarationList.declarations
  return declarations.length === 1 && ts.isIdentifier(declarations[0].name)
    ? declarations[0].name.text
    : undefined
}

function residueIdentity() {
  const residue = fixture.row.residues[0]
  return [
    fixture.row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ]
}

test(
  'Target119 exact-ip fixture and owner override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.evidenceIds, TARGET119_READ_ONLY_EXACT_IP_EVIDENCE_IDS)
    assert.deepEqual(
      TARGET119_READ_ONLY_EXACT_IP_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:${fixture.row.targetIndex}`,
        targetIndex: fixture.row.targetIndex,
        paths: fixture.row.ownerPaths,
        declarations: fixture.row.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: TARGET119_READ_ONLY_EXACT_IP_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.equal(
      sha256(JSON.stringify([fixture.row.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify([residueIdentity()])),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated baseline and target units retain the exact argv tuple and ip guard',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural delta',
        ),
      ),
    )
    const targetRegion = structural.regions.find(
      region => region.target?.index === fixture.target.unit.targetIndex,
    )
    assert(targetRegion)
    assert.deepEqual(
      {
        classification: targetRegion.classification,
        baselineUnitIndex: targetRegion.baselineUnitIndex,
        pairReason: targetRegion.pairReason,
        nodeType: targetRegion.target.nodeType,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
      },
      {
        classification: 'changed',
        baselineUnitIndex: fixture.baseline.unit.targetIndex,
        pairReason: fixture.target.pairReason,
        nodeType: fixture.target.unit.nodeType,
        start: fixture.target.unit.start,
        end: fixture.target.unit.end,
        sourceHash: fixture.target.unit.sha256,
        coarseHash: fixture.target.unit.coarseHash,
      },
    )
    assert.equal(fixture.baseline.unit.coarseHash, fixture.target.unit.coarseHash)

    for (const [label, bundle, expected] of [
      ['baseline', baseline, fixture.baseline],
      ['target', target, fixture.target],
    ]) {
      const unitText = bundle.slice(expected.unit.start, expected.unit.end)
      assert.deepEqual(descriptor(unitText), {
        bytes: expected.unit.bytes,
        sha256: expected.unit.sha256,
      }, `${label} complete unit`)
      for (const key of ['argvTuple', 'ipRegex']) {
        const fragment = bundle.slice(expected[key].start, expected[key].end)
        assert.deepEqual(descriptor(fragment), {
          bytes: expected[key].bytes,
          sha256: expected[key].sha256,
        }, `${label} ${key}`)
      }
      const representations = compiledRepresentations(unitText)
      assert.equal(representations.tupleMatches.length, 1, `${label} argv tuple`)
      assert.equal(representations.regexMatches.length, 1, `${label} ip regexp`)
    }

    assert.equal(
      target.slice(
        fixture.row.residues[0].start,
        fixture.row.residues[0].end,
      ),
      '"ip"',
    )
    assert.ok(
      fixture.row.residues[0].start >= fixture.target.argvTuple.start &&
        fixture.row.residues[0].end <= fixture.target.argvTuple.end,
    )
  },
)

test(
  'historical TypeScript owns and executes the exact ip addr allowlist guard',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const filename = path.join(sourceRoot, fixture.inputs.source.path.slice(4))
    const source = readExact(filename, fixture.inputs.source, 'Target119 source owner').toString('utf8')
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(sourceFile.parseDiagnostics, [])
    const declarations = new Map()
    for (const statement of sourceFile.statements) {
      const name = declarationName(ts, statement)
      if (fixture.row.declarations.includes(name)) {
        assert.equal(declarations.has(name), false, `duplicate ${name}`)
        declarations.set(name, statement)
      }
    }
    assert.deepEqual([...declarations.keys()].sort(), [...fixture.row.declarations].sort())
    for (const expected of fixture.source.declarations) {
      const declaration = declarations.get(expected.name)
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      assert.deepEqual(
        {
          name: expected.name,
          start,
          end,
          ...descriptor(source.slice(start, end)),
        },
        expected,
      )
    }
    const regexText = source.slice(
      fixture.source.ipRegex.start,
      fixture.source.ipRegex.end,
    )
    assert.equal(regexText, fixture.representation.ipRegex)
    assert.deepEqual(descriptor(regexText), {
      bytes: fixture.source.ipRegex.bytes,
      sha256: fixture.source.ipRegex.sha256,
    })

    const allowlistText = source.slice(
      fixture.source.declarations[0].start,
      fixture.source.declarations[0].end,
    )
    const consumerText = source.slice(
      fixture.source.declarations[1].start,
      fixture.source.declarations[1].end,
    )
    assert.equal((allowlistText.match(/\/\^ip addr\$\//g) ?? []).length, 1)
    assert.match(consumerText, /for \(const regex of READONLY_COMMAND_REGEXES\)/)
    assert.match(consumerText, /regex\.test\(testCommand\)/)

    const exactIpGuard = new RegExp('^ip addr$')
    assert.equal(exactIpGuard.test('ip addr'), true)
    for (const rejected of ['ip', 'ip addr ', 'ip addr show', 'sudo ip addr']) {
      assert.equal(exactIpGuard.test(rejected), false, rejected)
    }
  },
)

test(
  'exact-ip coverage evolves only from the pinned provisional row to the complete proof',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.row.targetIndex,
    )
    assert(row)
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.deepEqual(row.ownerIds, [
      'owner-src-tools-BashTool-readOnlyValidation-ts',
    ])
    const provisionalEvidence = ['source-map-attribution', 'semantic-test']
    const correctedEvidence = [...fixture.evidenceIds]
    assert.ok(
      JSON.stringify(row.evidenceIds) === JSON.stringify(provisionalEvidence) ||
        JSON.stringify(row.evidenceIds) === JSON.stringify(correctedEvidence),
      `unexpected exact-ip coverage state: ${JSON.stringify(row.evidenceIds)}`,
    )
    if (JSON.stringify(row.evidenceIds) === JSON.stringify(correctedEvidence)) {
      assert.equal(
        row.behavior,
        TARGET119_READ_ONLY_EXACT_IP_OWNER_OVERRIDES[0].behavior,
      )
      const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
      assert.deepEqual(
        correctedEvidence.map(id => evidence.get(id)?.kind),
        ['target-fragment', 'static-ast', 'semantic-test'],
      )
      assert.equal(
        correctedEvidence.every(
          id =>
            evidence.get(id)?.path ===
            'recovery/test/recovery-2.1.119-read-only-exact-ip-owner-proof.test.mjs',
        ),
        true,
      )
    }
  },
)
