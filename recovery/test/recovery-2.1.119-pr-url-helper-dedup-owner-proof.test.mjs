import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_PR_URL_HELPER_DEDUP_EVIDENCE_IDS,
  TARGET119_PR_URL_HELPER_DEDUP_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/pr-url-helper-dedup-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-pr-url-helper-dedup-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/pr-url-helper-dedup-owner-overrides.mjs',
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
  '08341b95f74207c144803fa905b80285f5b33acab4c8cd4fa2c970c3d27d71e4'
const HELPER_SHA256 =
  '631cabb866b537130f56f0f4a4ed35279e1ab75a30973dcc777db43fd470fea0'
const PR_URL_REGEX_LITERAL =
  String.raw`/^https:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\b/`

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

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function statementNames(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name ? [statement.name.text] : []
  }
  if (!ts.isVariableStatement(statement)) return []
  return statement.declarationList.declarations.flatMap(declaration =>
    ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
  )
}

function sourceStatements(ts, source, relativePath) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  const statements = new Map()
  for (const statement of sourceFile.statements) {
    for (const name of statementNames(ts, statement)) {
      const key = `${relativePath}:${name}`
      assert.equal(statements.has(key), false, `duplicate ${key}`)
      statements.set(key, { sourceFile, statement })
    }
  }
  return statements
}

function compileIsolatedPair(ts, source, statements, relativePath, names, returns) {
  const selectedText = names
    .map(name => {
      const row = statements.get(`${relativePath}:${name}`)
      assert(row, `missing ${relativePath}:${name}`)
      return source.slice(row.statement.getStart(row.sourceFile), row.statement.end)
    })
    .join('\n')
  const output = ts.transpileModule(selectedText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    'exports',
    `'use strict';\n${output}\nreturn {${returns.join(',')}}`,
  )({})
}

function residueIdentities() {
  return fixture.row.residues.map(residue => [
    residue.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

test(
  'Target119 PR URL coalescing fixture and two-path overrides remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_PR_URL_HELPER_DEDUP_EVIDENCE_IDS,
    )
    assert.deepEqual(
      TARGET119_PR_URL_HELPER_DEDUP_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.paths,
        declarations: row.declarations,
        evidenceIds: row.evidenceIds,
      })),
      [
        {
          targetIndex: 12727,
          paths: fixture.row.ownerPaths,
          declarations: ['parsePrUrl'],
          evidenceIds: fixture.evidenceIds,
        },
        {
          targetIndex: 12728,
          paths: fixture.row.ownerPaths,
          declarations: ['formatPrUrl', 'applyPrUrlTemplate'],
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify(fixture.target.units.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residueIdentities())),
      fixture.summary.residueIdentitiesSha256,
    )
  },
)

test(
  'authenticated bundle contains one coalesced helper pair with service initializer and UI consumer',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
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
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    for (const expected of [
      ...fixture.target.units,
      ...fixture.target.supportingUnits,
    ]) {
      const region = regions.get(expected.targetIndex)
      assert(region)
      assert.deepEqual(
        {
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          nodeType: expected.nodeType,
          start: expected.start,
          end: expected.end,
          sourceHash: expected.sha256,
          coarseHash: expected.coarseHash,
        },
      )
      assert.deepEqual(
        descriptor(target.slice(expected.start, expected.end)),
        { bytes: expected.bytes, sha256: expected.sha256 },
      )
    }
    for (const key of ['regexFragment', 'consumerCall']) {
      const expected = fixture.target[key]
      assert.deepEqual(
        descriptor(target.slice(expected.start, expected.end)),
        { bytes: expected.bytes, sha256: expected.sha256 },
      )
    }
    assert.equal(
      target.slice(
        fixture.target.regexFragment.start,
        fixture.target.regexFragment.end,
      ),
      PR_URL_REGEX_LITERAL,
    )
    assert.equal(
      target.slice(
        fixture.target.consumerCall.start,
        fixture.target.consumerCall.end,
      ),
      'fX7(K,f)',
    )
    assert.equal((target.match(/\.replaceAll\("\{host\}"/g) ?? []).length, 1)
    assert.equal(target.split(PR_URL_REGEX_LITERAL).length - 1, 1)
    for (const unit of fixture.target.units) {
      assert.doesNotThrow(() =>
        parse(target.slice(unit.start, unit.end), {
          ecmaVersion: 'latest',
          sourceType: 'script',
        }),
      )
    }
  },
)

test(
  'both exact TypeScript declaration pairs match the one target runtime binding',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const sources = new Map()
    const statements = new Map()
    for (const input of fixture.inputs.sourceFiles) {
      const filename = path.join(sourceRoot, input.path.slice(4))
      const source = readExact(filename, input, input.path).toString('utf8')
      sources.set(input.path, source)
      for (const [key, value] of sourceStatements(ts, source, input.path)) {
        statements.set(key, value)
      }
    }
    for (const expected of fixture.source.declarations) {
      const row = statements.get(`${expected.path}:${expected.name}`)
      assert(row, `${expected.path}:${expected.name}`)
      const start = row.statement.getStart(row.sourceFile)
      const end = row.statement.end
      assert.deepEqual(
        {
          path: expected.path,
          name: expected.name,
          start,
          end,
          ...descriptor(sources.get(expected.path).slice(start, end)),
        },
        expected,
      )
    }
    for (const expected of fixture.source.regexFragments) {
      const text = sources.get(expected.path).slice(expected.start, expected.end)
      assert.deepEqual(descriptor(text), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      assert.equal(
        text,
        PR_URL_REGEX_LITERAL,
      )
    }

    const service = compileIsolatedPair(
      ts,
      sources.get('src/utils/prStatus.ts'),
      statements,
      'src/utils/prStatus.ts',
      ['PR_URL', 'parsePrUrl', 'formatPrUrl'],
      ['parsePrUrl', 'formatPrUrl'],
    )
    const badge = compileIsolatedPair(
      ts,
      sources.get('src/components/PrBadge.tsx'),
      statements,
      'src/components/PrBadge.tsx',
      ['PR_URL_PATTERN', 'parsePrUrl', 'applyPrUrlTemplate'],
      ['parsePrUrl', 'applyPrUrlTemplate'],
    )
    const targetBundle = fs
      .readFileSync(
        artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
        'utf8',
      )
    const [parserUnit, formatterUnit] = fixture.target.units.map(unit =>
      targetBundle.slice(unit.start, unit.end),
    )
    const regex = /^https:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\b/
    const target = Function(
      'Rj1',
      `'use strict';${parserUnit}${formatterUnit};return {parse:AX7,format:fX7}`,
    )(regex)

    const urls = [
      'https://github.com/anthropics/claude-code/pull/123',
      'https://git.example.test/team/repo/pull/7/files',
      'https://github.com/not-a-pr',
    ]
    for (const url of urls) {
      assert.deepEqual(service.parsePrUrl(url), target.parse(url), url)
      assert.deepEqual(badge.parsePrUrl(url), target.parse(url), url)
    }
    const template = '{host}/{owner}/{repo}#{number} {url}'
    for (const url of urls) {
      const expected = target.format(url, template)
      assert.equal(service.formatPrUrl(url, template), expected)
      assert.equal(badge.applyPrUrlTemplate(url, template), expected)
      assert.equal(service.formatPrUrl(url), target.format(url))
      assert.equal(badge.applyPrUrlTemplate(url), target.format(url))
    }
  },
)

test(
  'PR URL helper coverage changes only as an atomic two-unit dedup proof',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const rows = fixture.target.units.map(unit =>
      coverage.rows.find(row => row.targetIndex === unit.targetIndex),
    )
    assert.equal(rows.every(Boolean), true)
    assert.equal(rows.every(row => row.disposition === 'source-runtime-covered'), true)
    const provisional = rows.every(
      row =>
        JSON.stringify(row.ownerIds) ===
          JSON.stringify(['owner-src-utils-ghPrStatus-ts']) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test']),
    )
    const correctedOwnerIds = [
      'owner-src-utils-prStatus-ts',
      'owner-src-components-PrBadge-tsx',
    ]
    const corrected = rows.every(
      row =>
        JSON.stringify(row.ownerIds) === JSON.stringify(correctedOwnerIds) &&
        JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds),
    )
    assert.ok(provisional || corrected, 'mixed or unknown PR URL coverage state')
    if (corrected) {
      const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
      assert.deepEqual(
        fixture.evidenceIds.map(id => evidence.get(id)?.kind),
        ['target-fragment', 'static-ast', 'semantic-test'],
      )
      assert.equal(
        fixture.evidenceIds.every(
          id =>
            evidence.get(id)?.path ===
            'recovery/test/recovery-2.1.119-pr-url-helper-dedup-owner-proof.test.mjs',
        ),
        true,
      )
    }
  },
)
