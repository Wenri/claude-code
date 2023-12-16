import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_AGENT_DETAIL_RELAY_EVIDENCE_IDS,
  TARGET119_AGENT_DETAIL_RELAY_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/agent-detail-relay-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-agent-detail-relay-owner-proofs.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/agent-detail-relay-owner-overrides.mjs',
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
  '927eefdb527015bd5a8ccab68ca408c2d16912997af6d7b96d47d59e207a0b4d'
const HELPER_SHA256 =
  'cce05903873234073d595b428c7385ad8eb0ef140bd602ffb8af35aaf7c358b8'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
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

function acornSignature(source) {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const strings = []
  const properties = []
  const numbers = []
  walk(tree, node => {
    if (node.type === 'Literal') {
      if (typeof node.value === 'string') strings.push(node.value)
      if (typeof node.value === 'number') numbers.push(node.value)
    }
    const property =
      node.type === 'Property' &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key.name
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property.name
          : undefined
    if (property) properties.push(property)
  })
  return { tree, strings, properties, numbers }
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceSpan(source, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  return { start, end, chars: text.length, sha256: sha256(text), text }
}

function residueIdentities() {
  return fixture.rows.flatMap(row =>
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
}

function renderToolsModel(resolvedTools) {
  if (resolvedTools.hasWildcard) return ['All tools']
  const { validTools, unavailableTools, invalidTools } = resolvedTools
  if (
    validTools.length === 0 &&
    unavailableTools.length === 0 &&
    invalidTools.length === 0
  ) {
    return ['None']
  }
  return [
    validTools.length > 0 ? validTools.join(', ') : null,
    unavailableTools.length > 0
      ? `⚠ Not available to subagents: ${unavailableTools.join(', ')}`
      : null,
    invalidTools.length > 0
      ? `⚠ Unrecognized: ${invalidTools.join(', ')}`
      : null,
  ].filter(Boolean)
}

test(
  'Target119 AgentDetail/relay fixture and owner overrides remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      fixture.evidenceIds,
      TARGET119_AGENT_DETAIL_RELAY_EVIDENCE_IDS,
    )
    assert.deepEqual(
      TARGET119_AGENT_DETAIL_RELAY_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.paths,
        declarations: row.declarations,
        evidenceIds: row.evidenceIds,
      })),
      fixture.rows.map(row => ({
        targetIndex: row.targetIndex,
        paths: row.ownerPaths,
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.equal(
      sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(JSON.stringify(residueIdentities())),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.equal(fixture.summary.units, 2)
    assert.equal(fixture.summary.residues, 4)
  },
)

test(
  'authenticated target fragments pin all four residues and their structural boundaries',
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

    for (const row of fixture.rows) {
      const region = structural.regions[row.targetIndex]
      assert(region)
      assert.equal(region.classification, row.classification)
      assert.deepEqual(
        {
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          nodeType: row.target.nodeType,
          start: row.target.start,
          end: row.target.end,
          sourceHash: row.target.sha256,
          coarseHash: row.target.coarseHash,
        },
      )
      const targetUnit = target.slice(row.target.start, row.target.end)
      assert.deepEqual(descriptor(targetUnit), {
        bytes: row.target.bytes,
        sha256: row.target.sha256,
      })
      for (const residue of row.residues) {
        const fragment = target.slice(residue.start, residue.end)
        assert.equal(
          residue.kind === 'property' ? fragment : JSON.parse(fragment),
          residue.value,
        )
        assert.ok(residue.start >= row.target.start)
        assert.ok(residue.end <= row.target.end)
      }
      if (row.baseline) {
        assert.equal(region.baselineUnitIndex, row.baseline.targetIndex)
        assert.equal(region.pairReason, row.pairReason)
        assert.equal(row.baseline.coarseHash, row.target.coarseHash)
        const baselineUnit = baseline.slice(row.baseline.start, row.baseline.end)
        assert.deepEqual(descriptor(baselineUnit), {
          bytes: row.baseline.bytes,
          sha256: row.baseline.sha256,
        })
      } else {
        assert.equal(region.baselineUnitIndex, undefined)
      }
    }

    const agentUnit = target.slice(
      fixture.rows[0].target.start,
      fixture.rows[0].target.end,
    )
    const signature = acornSignature(agentUnit)
    assert.ok(signature.properties.includes('unavailableTools'))
    assert.ok(signature.properties.includes('invalidTools'))
    assert.ok(signature.strings.includes('All tools'))
    assert.ok(signature.strings.includes('None'))
    assert.ok(signature.strings.includes(' Not available to subagents:'))
    assert.ok(signature.strings.includes(' Unrecognized: '))
    assert.ok(signature.numbers.includes(12), 'React compiler cache has 12 slots')
  },
)

test(
  'exact source AST owns the AgentDetail renderer and rejects its coarse neighbor',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const input = fixture.sources.agentDetail
    const filename = path.join(sourceRoot, input.path.slice(4))
    const source = readExact(filename, input, 'AgentDetail source').toString('utf8')
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    let agentDetail
    let renderToolsList
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'AgentDetail') {
        agentDetail = node
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'renderToolsList'
      ) {
        renderToolsList = node
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert(agentDetail)
    assert(renderToolsList)
    const agentSpan = sourceSpan(source, sourceFile, agentDetail)
    const rendererSpan = sourceSpan(source, sourceFile, renderToolsList)
    assert.deepEqual(
      { ...agentSpan, text: undefined },
      { ...input.declarations.AgentDetail, text: undefined },
    )
    assert.deepEqual(
      { ...rendererSpan, text: undefined },
      { ...input.declarations.renderToolsList, text: undefined },
    )
    for (const marker of [
      'resolvedTools.hasWildcard',
      'validTools,',
      'unavailableTools,',
      'invalidTools',
      ' Not available to subagents:',
      ' Unrecognized: ',
      'flexDirection="column"',
      'color="warning"',
    ]) {
      assert.ok(rendererSpan.text.includes(marker), marker)
    }

    const rejected = fixture.sources.rejectedCoarseOwner
    const rejectedText = readExact(
      path.join(sourceRoot, rejected.path.slice(4)),
      rejected,
      'rejected agentFileUtils owner',
    ).toString('utf8')
    for (const marker of [
      'renderToolsList',
      ' Not available to subagents:',
      ' Unrecognized: ',
    ]) {
      assert.equal(rejectedText.includes(marker), false, marker)
    }

    assert.deepEqual(renderToolsModel({ hasWildcard: true }), ['All tools'])
    assert.deepEqual(
      renderToolsModel({
        hasWildcard: false,
        validTools: [],
        unavailableTools: [],
        invalidTools: [],
      }),
      ['None'],
    )
    assert.deepEqual(
      renderToolsModel({
        hasWildcard: false,
        validTools: ['Read'],
        unavailableTools: ['Bash'],
        invalidTools: ['MadeUp'],
      }),
      [
        'Read',
        '⚠ Not available to subagents: Bash',
        '⚠ Unrecognized: MadeUp',
      ],
    )
  },
)

test(
  'the node:net source import lowers to the exact paired runtime initializer',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const input = fixture.sources.relay
    const filename = path.join(sourceRoot, input.path.slice(4))
    const source = readExact(filename, input, 'upstream relay source').toString('utf8')
    const sourceFile = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const imports = sourceFile.statements.filter(ts.isImportDeclaration)
    const netImports = imports.filter(
      statement => statement.moduleSpecifier.text === 'node:net',
    )
    assert.equal(netImports.length, 1)
    const netSpan = sourceSpan(source, sourceFile, netImports[0])
    assert.deepEqual(
      { ...netSpan, text: undefined },
      { ...input.declarations.nodeNetImport, text: undefined },
    )
    assert.match(netSpan.text, /\bcreateServer\b/)
    assert.match(netSpan.text, /\bNodeSocket\b/)
    const startRelay = sourceFile.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'startUpstreamProxyRelay',
    )
    assert(startRelay)
    const startSpan = sourceSpan(source, sourceFile, startRelay)
    assert.deepEqual(
      { ...startSpan, text: undefined },
      { ...input.declarations.startUpstreamProxyRelay, text: undefined },
    )
    assert.match(startSpan.text, /startNodeRelay/)

    const baseline = fs
      .readFileSync(
        artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
        'utf8',
      )
    const target = fs
      .readFileSync(
        artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
        'utf8',
      )
    const row = fixture.rows[1]
    for (const [label, bundle, unit] of [
      ['baseline', baseline, row.baseline],
      ['target', target, row.target],
    ]) {
      const unitText = bundle.slice(unit.start, unit.end)
      const signature = acornSignature(unitText)
      assert.deepEqual(signature.strings, ['net'], `${label} runtime import`)
      assert.match(unitText, /require\("net"\)/)
    }
    assert.equal(netImports[0].moduleSpecifier.text.replace(/^node:/, ''), 'net')
  },
)

test(
  'coverage accepts only the complete provisional or corrected owner-proof state',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = fixture.rows.map(expected => {
      const row = coverage.rows.find(item => item.targetIndex === expected.targetIndex)
      assert(row, `u${expected.targetIndex}`)
      return {
        targetIndex: expected.targetIndex,
        paths: row.ownerIds.map(ownerId => owners.get(ownerId)),
        evidenceIds: row.evidenceIds,
      }
    })
    const corrected = rows.map((row, index) => ({
      targetIndex: fixture.rows[index].targetIndex,
      paths: fixture.rows[index].ownerPaths,
      evidenceIds: fixture.evidenceIds,
    }))
    const provisional = [
      {
        targetIndex: 17642,
        paths: ['src/components/agents/agentFileUtils.ts'],
        evidenceIds: ['source-map-attribution', 'semantic-test'],
      },
      {
        targetIndex: 19600,
        paths: ['src/upstreamproxy/relay.ts'],
        evidenceIds: ['source-map-attribution', 'semantic-test'],
      },
    ]
    assert.ok(
      JSON.stringify(rows) === JSON.stringify(provisional) ||
        JSON.stringify(rows) === JSON.stringify(corrected),
      `unexpected partial coverage state: ${JSON.stringify(rows)}`,
    )
  },
)
