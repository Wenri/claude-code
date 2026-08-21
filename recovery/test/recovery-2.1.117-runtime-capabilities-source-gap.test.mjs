import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117RuntimeCapabilitiesSourceRecovery,
  TARGET117_RUNTIME_CAPABILITIES_INPUT_FILE,
  TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE,
  TARGET117_RUNTIME_CAPABILITIES_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-runtime-capabilities-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-runtime-capabilities-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'fa94e360695cd6ce2a69333317b27cb1cc39167c9108dceab8255d1dd590d3e7'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function bundlePath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot) {
  return path.join(
    path.resolve(sourceRoot),
    fixture.inputs.sourceFile.path.replace(/^src\//, ''),
  )
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const filename = sourceFilename(sourceRoot)
  const bytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
    ],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.input)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function copyPackagedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  const destination = sourceFilename(outputRoot)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(sourceFilename(sourceRoot), destination)
  return { temporaryRoot, sourceRoot: outputRoot }
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function bundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const grouped = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push({ start: node.start, end: node.end })
    grouped.set(key, occurrences)
  }
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') add('number', String(node.value), node)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
  })
  for (const occurrences of grouped.values()) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return grouped
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'repo-pinned TypeScript is available')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
}

function namedDeclaration(ts, sourceFile, expectedName) {
  const matches = []
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && node.name.text === expectedName) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, `${expectedName}: one named declaration`)
  return matches[0]
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected.name)
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  const bytes = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function sourceResidues(ts, sourceFile, declaration) {
  const counts = new Map()
  function add(kind, value) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add('string', node.text)
    }
    if (
      ts.isIdentifier(node) &&
      ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
        (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node))
    ) {
      add('property', node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return counts
}

function verifyExactPostimage(sourceRoot) {
  readExact(sourceFilename(sourceRoot), TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE)
}

test(
  '2.1.117 runtime-capabilities fixture pins four exact owner overrides',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture SHA-256')
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 4,
      residues: 10,
      recoveredFiles: 1,
      exportRegistryUnits: 1,
      remoteModeUnits: 2,
      defaultStateUnits: 1,
      ownerOverrides: 4,
    })
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [365, 562, 563, 596],
    )
    assert.deepEqual(TARGET117_RUNTIME_CAPABILITIES_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_RUNTIME_CAPABILITIES_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_RUNTIME_CAPABILITIES_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      fixture.rows.map(row => [
        row.targetIndex,
        [row.owner],
        row.declarations,
        fixture.evidenceIds,
      ]),
    )
    for (const override of TARGET117_RUNTIME_CAPABILITIES_OWNER_OVERRIDES) {
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), fixture.inputs.helper)
    assert.equal(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.sourceFile.blob,
      'authenticated raw state blob',
    )
  },
)

test(
  '2.1.117 bundles authenticate all four capability units and ten residues',
  { skip: !selected },
  () => {
    const baseline = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    ).toString('utf8')
    const target = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const baselineOccurrences = bundleOccurrences(baseline)
    const targetOccurrences = bundleOccurrences(target)
    const units = new Map()

    for (const row of fixture.rows) {
      const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
        row.targetUnit
      const region = regions.get(index)
      assert.ok(region, `u${index}: structural region`)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        { classification, nodeType, start, end, tokenCount, sourceHash, coarseHash },
      )
      const unit = target.slice(start, end)
      units.set(index, unit)
      assert.equal(Buffer.byteLength(unit), end - start, `u${index}: full bytes`)
      assert.equal(sha256(unit), sourceHash, `u${index}: full SHA-256`)
      const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
      assert.equal(ast.body.length, 1, `u${index}: exactly one unit`)
      assert.equal(ast.body[0].type, nodeType, `u${index}: node type`)

      for (const [kind, value, residueStart, residueEnd, ordinal, baselineCount] of row.residues) {
        const key = identity(kind, value)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          baselineCount,
          `u${index}: ${key} baseline count`,
        )
        const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
        assert.ok(occurrence, `u${index}: ${key} target ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residueStart, residueEnd],
          `u${index}: ${key} target range`,
        )
        assert.ok(
          residueStart >= start && residueEnd <= end,
          `u${index}: ${key} stays in complete unit`,
        )
      }
    }

    assert.match(units.get(365), /setCaps:\(\)=>UA8/)
    assert.match(units.get(365), /getCaps:\(\)=>NGH/)
    assert.equal(units.get(562), 'function u6(){return x$.caps.workspace==="remote"}')
    assert.equal(
      units.get(563),
      'function AM$(H){x$.caps={...x$.caps,workspace:H?"remote":"local"}}',
    )
    assert.match(
      units.get(596),
      /renderTarget:"ink",workspace:"local",canDrive:!0,transcriptSource:"local-jsonl",remote:null/,
    )
    assert.match(units.get(596), /x\$=vk6\(\)/)
  },
)

test(
  '2.1.117 capability replay is dual-state and preserves exact target semantics',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-runtime-capabilities-raw-')
    try {
      const rawSource = fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8')
      assert.doesNotMatch(rawSource, /DEFAULT_RUNTIME_CAPABILITIES/)
      assert.doesNotMatch(rawSource, /function getCaps/)
      assert.match(rawSource, /STATE\.isRemoteMode/)

      const first = applyTarget117RuntimeCapabilitiesSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117RuntimeCapabilitiesSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      verifyExactPostimage(raw.sourceRoot)

      const source = readExact(
        sourceFilename(raw.sourceRoot),
        fixture.inputs.sourceFile.output,
      ).toString('utf8')
      const ts = await loadTypeScript()
      const sourceAst = parseSource(ts, fixture.inputs.sourceFile.path, source)
      const declarations = new Map(
        fixture.inputs.sourceFile.declarations.map(expected => [
          expected.name,
          assertDeclaration(ts, sourceAst, source, expected),
        ]),
      )

      for (const name of ['getCaps', 'setCaps']) {
        const declaration = declarations.get(name)
        assert.ok(
          declaration.modifiers?.some(
            modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ),
          `${name}: exported declaration owns registry property`,
        )
      }
      const primaryDeclarations = new Map([
        [562, 'getIsRemoteMode'],
        [563, 'setIsRemoteMode'],
        [596, 'DEFAULT_RUNTIME_CAPABILITIES'],
      ])
      for (const row of fixture.rows.filter(row => row.targetIndex !== 365)) {
        const counts = sourceResidues(
          ts,
          sourceAst,
          declarations.get(primaryDeclarations.get(row.targetIndex)),
        )
        const required = new Map()
        for (const [kind, value] of row.residues) {
          const key = identity(kind, value)
          required.set(key, (required.get(key) ?? 0) + 1)
        }
        for (const [key, count] of required) {
          assert.ok(
            (counts.get(key) ?? 0) >= count,
            `u${row.targetIndex}: ${key} occurs in exact owner declaration`,
          )
        }
      }

      const initialState = source.slice(
        declarations.get('getInitialState').getStart(sourceAst),
        declarations.get('getInitialState').end,
      )
      assert.match(initialState, /caps: DEFAULT_RUNTIME_CAPABILITIES/)
      const getRemote = source.slice(
        declarations.get('getIsRemoteMode').getStart(sourceAst),
        declarations.get('getIsRemoteMode').end,
      )
      assert.match(getRemote, /STATE\.caps\.workspace === 'remote'/)
      const setRemote = source.slice(
        declarations.get('setIsRemoteMode').getStart(sourceAst),
        declarations.get('setIsRemoteMode').end,
      )
      assert.match(setRemote, /\.\.\.STATE\.caps/)
      assert.match(setRemote, /workspace: value \? 'remote' : 'local'/)
      const runtimeBridge = source.slice(
        declarations.get('getRuntimeCapabilities').getStart(sourceAst),
        declarations.get('setActiveRemoteControlTransport').end,
      )
      assert.match(runtimeBridge, /return getCaps\(\)/)
      assert.match(runtimeBridge, /setCaps\(\{ \.\.\.getCaps\(\), remote: transport \}\)/)
      assert.doesNotMatch(source, /STATE\.activeRemoteControlTransport/)
      assert.doesNotMatch(source, /STATE\.isRemoteMode/)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copyPackagedSource(
      packagedRoot,
      'target117-runtime-capabilities-packaged-',
    )
    try {
      const result = applyTarget117RuntimeCapabilitiesSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(
        ['recovered', 'already-recovered'].includes(result.status),
        `package state ${result.status}`,
      )
      verifyExactPostimage(packaged.sourceRoot)
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 capability replay rejects non-target mutation before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawSource('target117-runtime-capabilities-mutated-')
    try {
      fs.appendFileSync(sourceFilename(mutated.sourceRoot), '\n// mutation\n')
      assert.throws(
        () =>
          applyTarget117RuntimeCapabilitiesSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /Refusing non-target runtime-capabilities recovery/,
      )
      assert.match(
        fs.readFileSync(sourceFilename(mutated.sourceRoot), 'utf8'),
        /\/\/ mutation\n$/,
      )
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
    }
  },
)
