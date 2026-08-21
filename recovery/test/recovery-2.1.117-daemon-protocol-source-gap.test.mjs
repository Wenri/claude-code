import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_DAEMON_PROTOCOL_FILE,
  TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES,
  TARGET117_DAEMON_PROTOCOL_SOURCE,
  TARGET118_DAEMON_PROTOCOL_DONOR,
  applyTarget117DaemonProtocolSourceRecovery,
  deriveTarget117DaemonProtocolSourceFromTarget118,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-daemon-protocol-source-gap.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-daemon-protocol-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f689cc17d9a124eb09d01f23be627b5ae3b4a2295eca7e8807fa3b7db550b399'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function walk(node, visit, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], visit, node, index)
    }
    return
  }
  if (typeof node.type === 'string') visit(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, node, childKey)
    }
  }
}

function unit(bundle, expected, label) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  const program = parse(bytes.toString('utf8'), { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { bytes, source: bytes.toString('utf8'), node: program.body[0] }
}

function exactSlice(bundle, expected, label) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes.toString('utf8')
}

function propertyName(property) {
  if (property?.key?.type === 'Identifier') return property.key.name
  if (property?.key?.type === 'Literal') return property.key.value
  return undefined
}

function opLiteral(objectExpression) {
  const property = objectExpression?.properties?.find(
    candidate => propertyName(candidate) === 'op',
  )
  const value = property?.value
  if (
    value?.type === 'CallExpression' &&
    value.callee?.type === 'MemberExpression' &&
    value.callee.property?.name === 'literal' &&
    value.arguments?.[0]?.type === 'Literal'
  ) {
    return value.arguments[0].value
  }
  return undefined
}

function schemaObjectVariant(node, op) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.property?.name === 'object' &&
    node.arguments?.[0]?.type === 'ObjectExpression' &&
    opLiteral(node.arguments[0]) === op
  )
}

function normalizeRuntime(node, removals, parent = undefined, key = undefined) {
  if (Array.isArray(node)) {
    return node
      .filter(candidate => {
        if (
          candidate?.type === 'Property' &&
          removals.properties.has(propertyName(candidate))
        ) {
          return false
        }
        if (
          [...removals.controlOps].some(op => schemaObjectVariant(candidate, op))
        ) {
          return false
        }
        return true
      })
      .map((child, index) => normalizeRuntime(child, removals, node, index))
  }
  if (node === null || typeof node !== 'object') return node
  const result = {}
  for (const [childKey, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (node.type === 'Identifier' && childKey === 'name') {
      const retain =
        (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed)
      result[childKey] = retain ? child : '@id'
    } else {
      result[childKey] = normalizeRuntime(child, removals, node, childKey)
    }
  }
  return result
}

function normalizedRuntimeDescriptor(node, removals) {
  const normalized = JSON.stringify(normalizeRuntime(node, removals))
  return {
    chars: normalized.length,
    bytes: Buffer.byteLength(normalized),
    sha256: sha256(normalized),
    normalized,
  }
}

function schemaAssignments(node) {
  const matches = []
  walk(node, candidate => {
    if (
      candidate.type === 'AssignmentExpression' &&
      candidate.right?.type === 'CallExpression' &&
      candidate.right.callee?.type === 'Identifier' &&
      candidate.right.arguments?.length === 1 &&
      candidate.right.arguments[0]?.type === 'ArrowFunctionExpression'
    ) {
      matches.push(candidate.right)
    }
  })
  return matches
}

function normalizeSchemaExpression(
  node,
  parent = undefined,
  key = undefined,
) {
  if (Array.isArray(node)) {
    const normalized = node.map((child, index) =>
      normalizeSchemaExpression(child, node, index),
    )
    const merged = []
    for (const child of normalized) {
      if (
        child?.type === 'VariableDeclaration' &&
        merged.at(-1)?.type === 'VariableDeclaration'
      ) {
        merged.at(-1).declarations.push(...child.declarations)
      } else {
        merged.push(child)
      }
    }
    return merged
  }
  if (node === null || typeof node !== 'object') return node
  const result = {}
  for (const [childKey, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (node.type === 'Identifier' && childKey === 'name') {
      const retain =
        (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed)
      result[childKey] = retain ? child : '@id'
    } else if (node.type === 'VariableDeclaration' && childKey === 'kind') {
      result[childKey] = 'var'
    } else if (node.type === 'Property' && childKey === 'shorthand') {
      result[childKey] = false
    } else {
      result[childKey] = normalizeSchemaExpression(child, node, childKey)
    }
  }
  return result
}

function normalizedSchemaDescriptor(expression) {
  const normalized = JSON.stringify(normalizeSchemaExpression(expression))
  return {
    bytes: Buffer.byteLength(normalized),
    sha256: sha256(normalized),
    normalized,
  }
}

function extractProtocolPatchSource(patchBytes) {
  const patch = patchBytes.toString('utf8')
  const marker = 'diff --git a/src/daemon/protocol.ts b/src/daemon/protocol.ts\n'
  const start = patch.indexOf(marker)
  assert.ok(start >= 0, 'protocol donor diff exists')
  assert.equal(patch.indexOf(marker, start + marker.length), -1)
  const next = patch.indexOf('\ndiff --git ', start + marker.length)
  assert.ok(next > start, 'protocol donor diff is bounded')
  const section = patch.slice(start, next)
  const lines = section.split('\n')
  const hunk = lines.findIndex(line => line.startsWith('@@ '))
  assert.ok(hunk >= 0, 'protocol donor has one source hunk')
  const sourceLines = lines
    .slice(hunk + 1)
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1))
  return Buffer.from(`${sourceLines.join('\n')}\n`)
}

function gitBlobSha1(bytes) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex')
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function sourceDeclarations(source, sourceFile, ts) {
  const declarations = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      declarations.set(declaration.name.getText(sourceFile), declaration)
    }
  }
  return declarations
}

function initializerExpression(declaration, sourceFile) {
  const text = declaration.initializer.getText(sourceFile)
  return parse(`(${text})`, { ecmaVersion: 'latest' }).body[0].expression
}

function firstSchemaObject(expression) {
  let match
  walk(expression, candidate => {
    if (
      !match &&
      candidate.type === 'CallExpression' &&
      candidate.callee?.type === 'MemberExpression' &&
      candidate.callee.property?.name === 'object' &&
      candidate.arguments?.[0]?.type === 'ObjectExpression'
    ) {
      match = candidate.arguments[0]
    }
  })
  assert.ok(match, 'schema has an outer object')
  return match
}

function controlOps(expression) {
  const matches = []
  walk(expression, candidate => {
    if (
      candidate.type === 'CallExpression' &&
      candidate.callee?.type === 'MemberExpression' &&
      candidate.callee.property?.name === 'discriminatedUnion' &&
      candidate.arguments?.[0]?.value === 'op' &&
      candidate.arguments?.[1]?.type === 'ArrayExpression'
    ) {
      matches.push(candidate.arguments[1].elements.map(schema => {
        assert.equal(schema?.arguments?.[0]?.type, 'ObjectExpression')
        return opLiteral(schema.arguments[0])
      }))
    }
  })
  assert.equal(matches.length, 1, 'one control-message union')
  return matches[0]
}

function temporaryRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`))
  const sourceRoot = path.join(root, 'src')
  fs.mkdirSync(sourceRoot)
  return { root, sourceRoot }
}

function protocolFilename(sourceRoot) {
  return path.join(sourceRoot, 'daemon/protocol.ts')
}

test(
  'Target117 daemon protocol fixture, donor derivation, and override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 17480)
    assert.deepEqual(
      descriptor(TARGET117_DAEMON_PROTOCOL_SOURCE),
      expectedDescriptor(fixture.recoveredSource),
    )
    assert.deepEqual(
      TARGET117_DAEMON_PROTOCOL_FILE.postimage,
      expectedDescriptor(fixture.recoveredSource),
    )
    assert.deepEqual(
      TARGET118_DAEMON_PROTOCOL_DONOR,
      expectedDescriptor(fixture.sourceDonor),
    )

    const patchBytes = readExact(
      path.join(repositoryRoot, fixture.sourceDonor.patch.path),
      fixture.sourceDonor.patch,
      'stable Target118 source-facing patch',
    )
    const donor = extractProtocolPatchSource(patchBytes)
    assert.deepEqual(descriptor(donor), expectedDescriptor(fixture.sourceDonor))
    assert.equal(gitBlobSha1(donor), fixture.sourceDonor.patchBlobSha1)
    assert.equal(
      deriveTarget117DaemonProtocolSourceFromTarget118(donor),
      TARGET117_DAEMON_PROTOCOL_SOURCE,
    )
    assert.throws(
      () =>
        deriveTarget117DaemonProtocolSourceFromTarget118(
          Buffer.concat([donor, Buffer.from(' ')]),
        ),
      /donor drift/,
    )

    assert.equal(TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES.length, 1)
    assert.deepEqual(TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES[0], {
      key: `${caseName}:17480`,
      targetIndex: 17480,
      paths: ['src/daemon/protocol.ts'],
      declarations: [
        'DispatchSchema',
        'WorkerRecordSchema',
        'ManifestSchema',
        'ControlMessageSchema',
        'SettledJobSchema',
      ],
      evidenceIds: fixture.evidenceIds,
      behavior: TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES[0].behavior,
    })
    assert.match(
      TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES[0].behavior,
      /procStart.*attachId.*cliVersion.*respawn-stale/,
    )
    assert.equal(
      fixture.generatorWiring.helperExport,
      'applyTarget117DaemonProtocolSourceRecovery',
    )
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES',
    )
  },
)

test(
  'authenticated runtime units prove the two bounded temporal deltas and all three residue identities',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const target118Bundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_INNER_BUNDLE', fixture.target118Bundle),
      fixture.target118Bundle,
      'Target118 inner bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'Target117 structural ledger',
        ),
      ),
    )
    const target118Ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.target118StructuralLedger.path),
          fixture.target118StructuralLedger,
          'Target118 structural ledger',
        ),
      ),
    )
    const ledgerTarget = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    const ledgerBaseline = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineIndex,
    )
    const ledgerTarget118 = target118Ledger.unresolvedTarget.find(
      row => row.target.index === fixture.target118Unit.targetIndex,
    )
    assert.deepEqual(
      {
        ...ledgerTarget.target,
        classification: ledgerTarget.classification,
      },
      {
        index: fixture.targetUnit.targetIndex,
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: 'parsed',
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        location: ledgerTarget.target.location,
        topDefinitionCount: 1,
        classification: fixture.targetUnit.classification,
      },
    )
    assert.equal(ledgerBaseline.sourceHash, fixture.baselineUnit.sha256)
    assert.equal(ledgerBaseline.coarseHash, fixture.baselineUnit.coarseHash)
    assert.equal(ledgerTarget118.target.sourceHash, fixture.target118Unit.sha256)
    assert.equal(
      ledgerTarget118.target.coarseHash,
      fixture.target118Unit.coarseHash,
    )

    const baseline = unit(baselineBundle, fixture.baselineUnit, 'baseline protocol')
    const target = unit(targetBundle, fixture.targetUnit, 'Target117 protocol')
    const target118 = unit(
      target118Bundle,
      fixture.target118Unit,
      'Target118 protocol',
    )
    exactSlice(
      baselineBundle,
      fixture.runtimeProperties.baselineProcStart,
      'baseline procStart schema property',
    )
    exactSlice(
      targetBundle,
      fixture.runtimeProperties.targetProcStart,
      'Target117 procStart schema property',
    )
    exactSlice(
      targetBundle,
      fixture.runtimeProperties.targetAttach,
      'Target117 attachId attach property',
    )
    exactSlice(
      targetBundle,
      fixture.runtimeProperties.targetResize,
      'Target117 attachId resize property',
    )
    exactSlice(
      target118Bundle,
      fixture.runtimeProperties.target118CliVersion,
      'Target118-only cliVersion property',
    )
    exactSlice(
      target118Bundle,
      fixture.runtimeProperties.target118RespawnStale,
      'Target118-only respawn-stale variant',
    )

    const targetAttachProperties = []
    const targetProcStartProperties = []
    walk(target.node, (candidate, parent) => {
      if (candidate.type !== 'Property') return
      if (propertyName(candidate) === 'attachId') {
        assert.equal(Array.isArray(parent), true)
        targetAttachProperties.push({
          property: candidate,
          op: opLiteral({ properties: parent }),
        })
      }
      if (propertyName(candidate) === 'procStart') {
        targetProcStartProperties.push(candidate)
      }
    })
    assert.deepEqual(
      targetAttachProperties.map(row => row.op),
      ['attach', 'resize'],
    )
    assert.equal(targetProcStartProperties.length, 1)
    for (const { property } of targetAttachProperties) {
      assert.equal(property.value.type, 'CallExpression')
      assert.equal(property.value.callee.property.name, 'optional')
      assert.equal(property.value.arguments.length, 0)
    }

    for (const residue of fixture.targetResidues) {
      assert.equal(
        targetBundle.subarray(residue.start, residue.end).toString('utf8'),
        residue.value,
      )
      assert.ok(
        residue.start >= fixture.targetUnit.start &&
          residue.end <= fixture.targetUnit.end,
      )
    }

    const baselineToTarget = fixture.runtimeEvolutionProof.baselineToTarget117
    const normalizedBaseline = normalizedRuntimeDescriptor(baseline.node, {
      properties: new Set(),
      controlOps: new Set(),
    })
    const normalizedTarget = normalizedRuntimeDescriptor(target.node, {
      properties: new Set(['attachId']),
      controlOps: new Set(),
    })
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget.chars,
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      {
        chars: baselineToTarget.normalizedChars,
        bytes: baselineToTarget.normalizedBytes,
        sha256: baselineToTarget.normalizedSha256,
      },
    )

    const targetToTarget118 = fixture.runtimeEvolutionProof.target117ToTarget118
    const normalizedTargetFull = normalizedRuntimeDescriptor(target.node, {
      properties: new Set(),
      controlOps: new Set(),
    })
    const normalizedTarget118 = normalizedRuntimeDescriptor(target118.node, {
      properties: new Set(['cliVersion']),
      controlOps: new Set(['respawn-stale']),
    })
    assert.equal(normalizedTargetFull.normalized, normalizedTarget118.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget118.chars,
        bytes: normalizedTarget118.bytes,
        sha256: normalizedTarget118.sha256,
      },
      {
        chars: targetToTarget118.normalizedChars,
        bytes: targetToTarget118.normalizedBytes,
        sha256: targetToTarget118.normalizedSha256,
      },
    )
  },
)

test(
  'bounded Target117 source parses cleanly and every complete schema matches authenticated runtime AST',
  { skip: !selected },
  () => {
    const ts = typescript()
    const source = TARGET117_DAEMON_PROTOCOL_SOURCE
    const sourceFile = ts.createSourceFile(
      fixture.recoveredSource.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const declarations = sourceDeclarations(source, sourceFile, ts)

    for (const expected of fixture.recoveredSource.declarations) {
      const declaration = declarations.get(expected.name)
      assert.ok(declaration, `${expected.name}: declaration exists`)
      const statement = declaration.parent.parent
      const value = source.slice(statement.getStart(sourceFile), statement.end)
      assert.deepEqual(descriptor(value), expectedDescriptor(expected))
    }

    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
    )
    const runtime = unit(targetBundle, fixture.targetUnit, 'Target117 protocol')
    const runtimeSchemas = schemaAssignments(runtime.node)
    const schemaNames = Object.keys(fixture.recoveredSource.schemaContracts)
    assert.equal(runtimeSchemas.length, schemaNames.length)

    for (const [index, name] of schemaNames.entries()) {
      const declaration = declarations.get(name)
      assert.ok(declaration?.initializer, `${name}: initializer exists`)
      const sourceExpression = initializerExpression(declaration, sourceFile)
      const sourceNormalized = normalizedSchemaDescriptor(sourceExpression)
      const runtimeNormalized = normalizedSchemaDescriptor(runtimeSchemas[index])
      const expected = fixture.recoveredSource.schemaContracts[name]
      assert.deepEqual(
        { bytes: sourceNormalized.bytes, sha256: sourceNormalized.sha256 },
        { bytes: expected.normalizedBytes, sha256: expected.normalizedSha256 },
        `${name}: source schema fingerprint`,
      )
      assert.equal(
        sourceNormalized.normalized,
        runtimeNormalized.normalized,
        `${name}: authored source equals authenticated runtime schema`,
      )

      if (expected.keys) {
        assert.deepEqual(
          firstSchemaObject(sourceExpression).properties.map(propertyName),
          expected.keys,
          `${name}: complete schema keys`,
        )
      }
      if (expected.ops) {
        assert.deepEqual(controlOps(sourceExpression), expected.ops)
      }
    }

    for (const forbidden of fixture.recoveredSource.forbiddenLaterSemantics) {
      assert.equal(source.includes(forbidden), false, `${forbidden}: temporally absent`)
    }
    assert.equal((source.match(/procStart/g) ?? []).length, 1)
    assert.equal((source.match(/attachId/g) ?? []).length, 2)
  },
)

test(
  'Target117 daemon protocol replay accepts only absent or exact postimage states and refuses path drift',
  { skip: !selected },
  () => {
    const first = temporaryRoot('target117-protocol-raw')
    try {
      const result = applyTarget117DaemonProtocolSourceRecovery({
        sourceRoot: first.sourceRoot,
      })
      assert.deepEqual(result, {
        caseName,
        status: 'recovered',
        files: ['src/daemon/protocol.ts'],
        ownerOverrides: 1,
      })
      assert.deepEqual(
        descriptor(fs.readFileSync(protocolFilename(first.sourceRoot))),
        expectedDescriptor(fixture.recoveredSource),
      )
      assert.deepEqual(
        applyTarget117DaemonProtocolSourceRecovery({
          sourceRoot: first.sourceRoot,
        }),
        {
          caseName,
          status: 'already-recovered',
          files: [],
          ownerOverrides: 1,
        },
      )
    } finally {
      fs.rmSync(first.root, { recursive: true, force: true })
    }

    const packageSourceRoot = path.resolve(
      process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.equal(fs.lstatSync(packageSourceRoot).isDirectory(), true)
    const packageProtocol = protocolFilename(packageSourceRoot)
    const packageState = fs.existsSync(packageProtocol)
      ? descriptor(fs.readFileSync(packageProtocol))
      : null
    if (packageState !== null) {
      assert.deepEqual(packageState, expectedDescriptor(fixture.recoveredSource))
    }
    const packaged = temporaryRoot('target117-protocol-package')
    try {
      if (packageState !== null) {
        fs.mkdirSync(path.dirname(protocolFilename(packaged.sourceRoot)), {
          recursive: true,
        })
        fs.copyFileSync(
          packageProtocol,
          protocolFilename(packaged.sourceRoot),
        )
      }
      const result = applyTarget117DaemonProtocolSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.equal(
        result.status,
        packageState === null ? 'recovered' : 'already-recovered',
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(protocolFilename(packaged.sourceRoot))),
        expectedDescriptor(fixture.recoveredSource),
      )
    } finally {
      fs.rmSync(packaged.root, { recursive: true, force: true })
    }

    const drift = temporaryRoot('target117-protocol-drift')
    try {
      fs.mkdirSync(path.dirname(protocolFilename(drift.sourceRoot)), {
        recursive: true,
      })
      fs.writeFileSync(protocolFilename(drift.sourceRoot), 'drift\n')
      assert.throws(
        () =>
          applyTarget117DaemonProtocolSourceRecovery({
            sourceRoot: drift.sourceRoot,
          }),
        /expected absent raw source or postimage/,
      )
      assert.equal(fs.readFileSync(protocolFilename(drift.sourceRoot), 'utf8'), 'drift\n')
    } finally {
      fs.rmSync(drift.root, { recursive: true, force: true })
    }

    const fileLink = temporaryRoot('target117-protocol-file-link')
    try {
      fs.mkdirSync(path.dirname(protocolFilename(fileLink.sourceRoot)), {
        recursive: true,
      })
      const outside = path.join(fileLink.root, 'outside.ts')
      fs.writeFileSync(outside, TARGET117_DAEMON_PROTOCOL_SOURCE)
      fs.symlinkSync(outside, protocolFilename(fileLink.sourceRoot))
      assert.throws(
        () =>
          applyTarget117DaemonProtocolSourceRecovery({
            sourceRoot: fileLink.sourceRoot,
          }),
        /expected an absent path or real file/,
      )
    } finally {
      fs.rmSync(fileLink.root, { recursive: true, force: true })
    }

    const directoryLink = temporaryRoot('target117-protocol-directory-link')
    try {
      const outside = path.join(directoryLink.root, 'outside')
      fs.mkdirSync(outside)
      fs.symlinkSync(outside, path.join(directoryLink.sourceRoot, 'daemon'))
      assert.throws(
        () =>
          applyTarget117DaemonProtocolSourceRecovery({
            sourceRoot: directoryLink.sourceRoot,
          }),
        /expected a real directory/,
      )
      assert.equal(fs.readdirSync(outside).length, 0)
    } finally {
      fs.rmSync(directoryLink.root, { recursive: true, force: true })
    }
  },
)
