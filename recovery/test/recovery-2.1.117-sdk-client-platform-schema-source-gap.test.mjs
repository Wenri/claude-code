import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parseExpressionAt } from 'acorn'
import {
  applyTarget117SdkClientPlatformSchemaSourceRecovery,
  TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_OWNER_OVERRIDES,
  TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_POSTIMAGE,
  TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_RAW_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-sdk-client-platform-schema-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-sdk-client-platform-schema-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f888316d9adf7cd8757ad74130d2eb3ef6f70d19663c78e12009a612e9f7fe32'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)
const DESCRIPTION =
  '@internal The `anthropic-client-platform` value of the client that sent this message (e.g. `ios`, `android`, `web_claude_ai`, `desktop_app`). Injected server-side by CCR ingress from the request header.'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, label)
  return bytes
}

function readLedger(input) {
  const bytes = readExact(
    path.join(repositoryRoot, input[0]),
    { bytes: input[1], sha256: input[2] },
    input[0],
  )
  return JSON.parse(gunzipSync(bytes))
}

function regionTuple(region) {
  const target = region.target
  return [
    target.index,
    region.classification,
    target.nodeType,
    target.start,
    target.end,
    target.tokenCount,
    target.sourceHash,
    target.coarseHash,
  ]
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const sourcePath = fixture.inputs.rawSource.path
  const bytes = execFileSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${sourcePath}`],
    { cwd: repositoryRoot },
  )
  const filename = sourceFilename(sourceRoot, sourcePath)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const sourcePath = fixture.inputs.rawSource.path
  const output = sourceFilename(sourceRoot, sourcePath)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.copyFileSync(sourceFilename(inputRoot, sourcePath), output)
  return { temporaryRoot, sourceRoot }
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function descendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function parseTs(ts, filename, bytes) {
  const sourceFile = ts.createSourceFile(
    filename,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactDeclaration(ts, sourceFile, bytes, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'SDKUserMessageContentSchema',
  )
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const [start, end, byteCount, hash] = expected
  assert.deepEqual(
    [
      declaration.getStart(sourceFile),
      declaration.end,
      ...Object.values(descriptor(bytes.subarray(start, end))),
    ],
    expected,
  )
  return declaration
}

function assertMinifiedSchemaProperty(propertyText) {
  const expression = parseExpressionAt(`({${propertyText}})`, 0, {
    ecmaVersion: 'latest',
  })
  assert.equal(expression.type, 'ObjectExpression')
  assert.equal(expression.properties.length, 1)
  const property = expression.properties[0]
  assert.equal(property.key.name, 'client_platform')
  const describe = property.value
  assert.equal(describe.type, 'CallExpression')
  assert.equal(describe.callee.property.name, 'describe')
  assert.deepEqual(describe.arguments.map(argument => argument.value), [DESCRIPTION])
  const optional = describe.callee.object
  assert.equal(optional.type, 'CallExpression')
  assert.equal(optional.callee.property.name, 'optional')
  assert.equal(optional.arguments.length, 0)
  const string = optional.callee.object
  assert.equal(string.type, 'CallExpression')
  assert.equal(string.callee.property.name, 'string')
  assert.equal(string.arguments.length, 0)
  assert.equal(string.callee.object.type, 'Identifier')
  return propertyText.replace(
    /client_platform:[A-Za-z_$][\w$]*\./,
    'client_platform:SCHEMA.',
  )
}

test('Target117 authenticates the complete SDK schema unit, residues, and sole owner', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(
    path.join(repositoryRoot, fixture.inputs.helper.path),
    {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    },
  )

  for (const input of [
    fixture.inputs.rawSource,
    fixture.inputs.lastSourceWithoutProperty,
    fixture.inputs.firstSourceDonor,
  ]) {
    assert.equal(
      execFileSync('git', ['rev-parse', `${input.commit}^{tree}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      input.tree,
    )
    assert.equal(
      execFileSync('git', ['rev-parse', `${input.commit}:${input.path}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      input.blob,
    )
    const bytes = execFileSync('git', ['show', `${input.commit}:${input.path}`], {
      cwd: repositoryRoot,
    })
    assert.deepEqual(descriptor(bytes), {
      bytes: input.bytes,
      sha256: input.sha256,
    })
  }

  const baselineInput = fixture.inputs.baselineBundle
  const baseline = readExact(
    path.join(artifactRoot, baselineInput[0]),
    { bytes: baselineInput[1], sha256: baselineInput[2] },
  )
  assert.equal(countOccurrences(baseline.toString('utf8'), DESCRIPTION), 0)

  const targetInput = fixture.inputs.targetBundles[0]
  const target = readExact(
    path.join(artifactRoot, targetInput[0]),
    { bytes: targetInput[1], sha256: targetInput[2] },
  )
  const ledger = readLedger(fixture.inputs.structuralLedgers[0])
  const region = ledger.regions.find(
    row => row.target.index === fixture.target117.unit[0],
  )
  assert.ok(region)
  assert.deepEqual(regionTuple(region), fixture.target117.unit)
  assert.deepEqual(
    descriptor(target.subarray(region.target.start, region.target.end)),
    {
      bytes: region.target.end - region.target.start,
      sha256: region.target.sourceHash,
    },
  )

  const [propertyStart, propertyEnd, propertyBytes, propertyHash] =
    fixture.target117.property
  const property = target.subarray(propertyStart, propertyEnd)
  assert.deepEqual(descriptor(property), {
    bytes: propertyBytes,
    sha256: propertyHash,
  })
  assertMinifiedSchemaProperty(property.toString('utf8'))
  assert.deepEqual(
    fixture.target117.residues.map(row =>
      target.subarray(row[2], row[3]).toString('utf8'),
    ),
    ['client_platform', `"${DESCRIPTION}"`],
  )

  assert.deepEqual(
    TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_OWNER_OVERRIDES.map(row => [
      row.key,
      row.targetIndex,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    [[
      `${caseName}:9971`,
      9971,
      [fixture.inputs.rawSource.path],
      ['SDKUserMessageContentSchema'],
      fixture.evidenceIds,
    ]],
  )
})

test('the SDK client-platform schema is present from Target117 and stable through Target121', { skip: !selected }, () => {
  let normalizedProperty
  for (let versionIndex = 0; versionIndex < fixture.persistentTargetWitnesses.length; versionIndex++) {
    const [
      version,
      targetIndex,
      unitStart,
      unitEnd,
      tokenCount,
      unitHash,
      propertyStart,
      propertyEnd,
      propertyHash,
    ] = fixture.persistentTargetWitnesses[versionIndex]
    const bundleInput = fixture.inputs.targetBundles[versionIndex]
    assert.equal(bundleInput[0].startsWith(`${version}-`), true)
    const bundle = readExact(
      path.join(artifactRoot, bundleInput[0]),
      { bytes: bundleInput[1], sha256: bundleInput[2] },
    )
    const ledger = readLedger(fixture.inputs.structuralLedgers[versionIndex])
    const region = ledger.regions.find(row => row.target.index === targetIndex)
    assert.ok(region, `${version} u${targetIndex}`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.tokenCount,
        region.target.sourceHash,
      ],
      [unitStart, unitEnd, tokenCount, unitHash],
    )
    assert.equal(
      sha256(bundle.subarray(unitStart, unitEnd)),
      unitHash,
    )
    const property = bundle.subarray(propertyStart, propertyEnd)
    assert.equal(sha256(property), propertyHash)
    const normalized = assertMinifiedSchemaProperty(property.toString('utf8'))
    normalizedProperty ??= normalized
    assert.equal(normalized, normalizedProperty)
  }
})

test('the first recovered donor supplies exactly the bounded optional-string schema property', { skip: !selected }, async () => {
  const ts = await loadTypeScript()
  const raw = fixture.inputs.rawSource
  const rawBytes = execFileSync('git', ['show', `${raw.commit}:${raw.path}`], {
    cwd: repositoryRoot,
  })
  const rawAst = parseTs(ts, raw.path, rawBytes)
  exactDeclaration(ts, rawAst, rawBytes, raw.declaration)
  assert.equal(
    descendants(
      ts,
      rawAst,
      node =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(rawAst) === 'client_platform',
    ).length,
    0,
  )

  const before = fixture.inputs.lastSourceWithoutProperty
  const beforeBytes = execFileSync(
    'git',
    ['show', `${before.commit}:${before.path}`],
    { cwd: repositoryRoot },
  )
  assert.equal(countOccurrences(beforeBytes.toString('utf8'), DESCRIPTION), 0)

  const donor = fixture.inputs.firstSourceDonor
  const donorBytes = execFileSync(
    'git',
    ['show', `${donor.commit}:${donor.path}`],
    { cwd: repositoryRoot },
  )
  const donorAst = parseTs(ts, donor.path, donorBytes)
  const donorProperties = descendants(
    ts,
    donorAst,
    node =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(donorAst) === 'client_platform',
  )
  assert.equal(donorProperties.length, 1)
  const donorProperty = donorProperties[0]
  assert.deepEqual(
    [
      donorProperty.getStart(donorAst),
      donorProperty.end,
      ...Object.values(
        descriptor(
          donorBytes.subarray(
            donorProperty.getStart(donorAst),
            donorProperty.end,
          ),
        ),
      ),
    ],
    donor.property,
  )

  const rawReplay = materializeRawSource('target117-sdk-platform-ast-')
  try {
    assert.equal(
      applyTarget117SdkClientPlatformSchemaSourceRecovery({
        sourceRoot: rawReplay.sourceRoot,
      }).status,
      'recovered',
    )
    const post = fixture.inputs.postimage
    const postBytes = readExact(
      sourceFilename(rawReplay.sourceRoot, post.path),
      { bytes: post.bytes, sha256: post.sha256 },
    )
    const postAst = parseTs(ts, post.path, postBytes)
    const declaration = exactDeclaration(
      ts,
      postAst,
      postBytes,
      post.declaration,
    )
    const properties = descendants(
      ts,
      declaration,
      node =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(postAst) === 'client_platform',
    )
    assert.equal(properties.length, 1)
    const property = properties[0]
    assert.deepEqual(
      [
        property.getStart(postAst),
        property.end,
        ...Object.values(
          descriptor(
            postBytes.subarray(property.getStart(postAst), property.end),
          ),
        ),
      ],
      post.property,
    )
    assert.equal(property.getText(postAst), donorProperty.getText(donorAst))

    const initializer = property.initializer.getText(postAst)
    const z = {
      string() {
        return {
          optional() {
            return {
              parse(value) {
                if (value === undefined || typeof value === 'string') return value
                throw new TypeError('expected optional string')
              },
              describe(description) {
                this.description = description
                return this
              },
            }
          },
        }
      },
    }
    const schema = new Function('z', `return ${initializer}`)(z)
    assert.equal(schema.description, DESCRIPTION)
    assert.equal(schema.parse(undefined), undefined)
    assert.equal(schema.parse('ios'), 'ios')
    assert.throws(() => schema.parse(false), /expected optional string/)
  } finally {
    fs.rmSync(rawReplay.temporaryRoot, { recursive: true, force: true })
  }
})

test('SDK client-platform schema replay is raw/package dual-state, idempotent, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_RAW_FILE, {
    path: fixture.inputs.rawSource.path,
    bytes: fixture.inputs.rawSource.bytes,
    sha256: fixture.inputs.rawSource.sha256,
  })
  assert.deepEqual(TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_POSTIMAGE, {
    path: fixture.inputs.postimage.path,
    bytes: fixture.inputs.postimage.bytes,
    sha256: fixture.inputs.postimage.sha256,
  })

  const raw = materializeRawSource('target117-sdk-platform-raw-')
  try {
    assert.equal(
      applyTarget117SdkClientPlatformSchemaSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117SdkClientPlatformSchemaSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }

  let packageSeed
  const selectedSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        packageSeed = materializeRawSource('target117-sdk-platform-package-seed-')
        applyTarget117SdkClientPlatformSchemaSourceRecovery({
          sourceRoot: packageSeed.sourceRoot,
        })
        return packageSeed.sourceRoot
      })()
  const packaged = copySelectedSource(
    selectedSourceRoot,
    'target117-sdk-platform-package-',
  )
  try {
    const first = applyTarget117SdkClientPlatformSchemaSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    assert.equal(
      applyTarget117SdkClientPlatformSchemaSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (packageSeed) {
      fs.rmSync(packageSeed.temporaryRoot, { recursive: true, force: true })
    }
  }

  const drift = materializeRawSource('target117-sdk-platform-drift-')
  try {
    const filename = sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.path)
    fs.appendFileSync(filename, '\n// drift\n')
    assert.throws(
      () => applyTarget117SdkClientPlatformSchemaSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }

  const mixed = materializeRawSource('target117-sdk-platform-mixed-')
  try {
    const filename = sourceFilename(mixed.sourceRoot, fixture.inputs.rawSource.path)
    const source = fs.readFileSync(filename, 'utf8').replace(
      "    priority: z.enum(['now', 'next', 'later']).optional(),\n",
      "    priority: z.enum(['now', 'next', 'later']).optional(),\n    client_platform: z.string().optional(),\n",
    )
    fs.writeFileSync(filename, source)
    assert.throws(
      () => applyTarget117SdkClientPlatformSchemaSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
      /refusing mixed or non-Target117 state/,
    )
  } finally {
    fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
  }
})
