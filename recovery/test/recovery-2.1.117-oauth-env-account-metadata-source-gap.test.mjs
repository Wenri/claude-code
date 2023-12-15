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
  applyTarget117OauthEnvAccountMetadataSourceRecovery,
  TARGET117_OAUTH_ENV_ACCOUNT_METADATA_INPUT_FILE,
  TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE,
  TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-oauth-env-account-metadata-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-oauth-env-account-metadata-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '326ab30a603d3a99edde57dcea910ec20a3745ee3e7d25e3670fa10913f2b3c2'
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
    fixture.inputs.sourceFile.path.slice('src/'.length),
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
    const values = grouped.get(key) ?? []
    values.push({ start: node.start, end: node.end })
    grouped.set(key, values)
  }
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
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
  for (const values of grouped.values()) {
    values.sort((left, right) => left.start - right.start)
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

function oauthDeclaration(ts, sourceFile) {
  const matches = []
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'getClaudeAIOAuthTokens'
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1, 'one getClaudeAIOAuthTokens declaration')
  return matches[0]
}

function assertDeclaration(ts, sourceFile, source, expected) {
  const declaration = oauthDeclaration(ts, sourceFile)
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  assert.deepEqual(
    descriptor(
      Buffer.from(
        source.slice(declaration.getStart(sourceFile), declaration.end),
      ),
    ),
    { bytes: expected.bytes, sha256: expected.sha256 },
  )
  return declaration
}

function oauthCallback(ts, declaration) {
  assert.ok(declaration.initializer && ts.isCallExpression(declaration.initializer))
  assert.equal(declaration.initializer.arguments.length, 1)
  const callback = declaration.initializer.arguments[0]
  assert.ok(ts.isArrowFunction(callback), 'memoized owner contains one callback')
  return callback
}

function metadataAssignments(ts, callback) {
  const values = new Map([
    ['subscriptionType', []],
    ['rateLimitTier', []],
  ])
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      values.has(node.name.text)
    ) {
      values.get(node.name.text).push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(callback)
  return values
}

function assertEnvironmentMetadataAst(ts, sourceFile, declaration) {
  const callback = oauthCallback(ts, declaration)
  const assignments = metadataAssignments(ts, callback)
  for (const [propertyName, expectedEnvName] of [
    ['subscriptionType', 'CLAUDE_CODE_SUBSCRIPTION_TYPE'],
    ['rateLimitTier', 'CLAUDE_CODE_RATE_LIMIT_TIER'],
  ]) {
    const propertyAssignments = assignments.get(propertyName)
    assert.equal(propertyAssignments.length, 2, `${propertyName}: two token paths`)
    for (const assignment of propertyAssignments) {
      const initializer = assignment.initializer
      assert.ok(ts.isBinaryExpression(initializer), `${propertyName}: fallback`)
      assert.equal(initializer.operatorToken.kind, ts.SyntaxKind.BarBarToken)
      assert.equal(initializer.right.kind, ts.SyntaxKind.NullKeyword)
      let environmentAccess = initializer.left
      if (ts.isParenthesizedExpression(environmentAccess)) {
        environmentAccess = environmentAccess.expression
      }
      if (propertyName === 'subscriptionType') {
        assert.ok(ts.isAsExpression(environmentAccess), 'subscription type cast')
        assert.equal(environmentAccess.type.getText(sourceFile), 'SubscriptionType')
        environmentAccess = environmentAccess.expression
      }
      assert.ok(ts.isPropertyAccessExpression(environmentAccess))
      assert.equal(environmentAccess.expression.getText(sourceFile), 'process.env')
      assert.equal(environmentAccess.name.text, expectedEnvName)
    }
  }
  return callback
}

function executeCallback(ts, sourceFile, source, callback, options = {}) {
  const callbackText = source.slice(callback.getStart(sourceFile), callback.end)
  const transpiled = ts.transpileModule(`const subject = ${callbackText}`, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  let storageReads = 0
  let loggedErrors = 0
  const subject = new Function(
    'process',
    'isBareMode',
    'getOAuthTokenFromFileDescriptor',
    'getSecureStorage',
    'logError',
    `${transpiled}\nreturn subject`,
  )(
    { env: options.env ?? {} },
    () => options.bare ?? false,
    () => options.fileDescriptorToken ?? null,
    () => ({
      read() {
        storageReads += 1
        if (options.storageError) throw options.storageError
        return options.storageData ?? null
      },
    }),
    () => {
      loggedErrors += 1
    },
  )
  return { value: subject(), storageReads, loggedErrors }
}

function verifyOutput(sourceRoot) {
  return readExact(
    sourceFilename(sourceRoot),
    TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE,
  )
}

test(
  '2.1.117 OAuth metadata fixture pins one bounded replay and owner override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 4,
      recoveredFiles: 1,
      replacements: 2,
      ownerOverrides: 1,
    })
    assert.deepEqual(TARGET117_OAUTH_ENV_ACCOUNT_METADATA_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override.paths,
        override.declarations,
        override.evidenceIds,
      ]),
      [[6201, ['src/utils/auth.ts'], ['getClaudeAIOAuthTokens'], fixture.evidenceIds]],
    )
    assert.match(
      TARGET117_OAUTH_ENV_ACCOUNT_METADATA_OWNER_OVERRIDES[0].behavior,
      /both the direct OAuth environment token and the file-descriptor token/,
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'replay helper',
    )
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
    )
  },
)

test(
  '2.1.117 bundle authenticates the complete OAuth unit and all four residues',
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
          'structural ledger',
        ),
      ),
    )
    const row = fixture.rows[0]
    const [index, classification, nodeType, start, end, tokenCount, sourceHash, coarseHash] =
      row.targetUnit
    const region = structural.regions.find(item => item.target.index === index)
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
    assert.equal(Buffer.byteLength(unit), end - start)
    assert.equal(sha256(unit), sourceHash)
    const unitAst = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, nodeType)
    assert.match(
      unit,
      /CLAUDE_CODE_OAUTH_TOKEN[\s\S]*CLAUDE_CODE_SUBSCRIPTION_TYPE[\s\S]*CLAUDE_CODE_RATE_LIMIT_TIER/,
    )
    assert.match(
      unit,
      /qv\$\(\)[\s\S]*CLAUDE_CODE_SUBSCRIPTION_TYPE[\s\S]*CLAUDE_CODE_RATE_LIMIT_TIER/,
    )

    const baselineOccurrences = bundleOccurrences(baseline)
    const targetOccurrences = bundleOccurrences(target)
    for (const [kind, value, residueStart, residueEnd, ordinal, baselineCount] of row.residues) {
      const key = identity(kind, value)
      assert.equal((baselineOccurrences.get(key) ?? []).length, baselineCount)
      const occurrence = (targetOccurrences.get(key) ?? [])[ordinal - 1]
      assert.ok(occurrence, `${key}: target ordinal ${ordinal}`)
      assert.deepEqual([occurrence.start, occurrence.end], [residueStart, residueEnd])
      assert.ok(residueStart >= start && residueEnd <= end)
    }
  },
)

test(
  '2.1.117 OAuth metadata replay is dual-state, typed, and executable',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-oauth-metadata-raw-')
    try {
      const rawSource = fs.readFileSync(sourceFilename(raw.sourceRoot), 'utf8')
      const rawAst = parseSource(ts, fixture.inputs.sourceFile.path, rawSource)
      const rawDeclaration = assertDeclaration(
        ts,
        rawAst,
        rawSource,
        fixture.inputs.sourceFile.rawDeclaration,
      )
      const rawCallback = oauthCallback(ts, rawDeclaration)
      const rawAssignments = metadataAssignments(ts, rawCallback)
      assert.ok(
        [...rawAssignments.values()].flat().every(
          assignment => assignment.initializer.kind === ts.SyntaxKind.NullKeyword,
        ),
        'raw owner has only null metadata placeholders',
      )
      assert.deepEqual(
        executeCallback(ts, rawAst, rawSource, rawCallback, {
          env: {
            CLAUDE_CODE_OAUTH_TOKEN: 'direct-token',
            CLAUDE_CODE_SUBSCRIPTION_TYPE: 'max',
            CLAUDE_CODE_RATE_LIMIT_TIER: 'tier-a',
          },
        }).value,
        {
          accessToken: 'direct-token',
          refreshToken: null,
          expiresAt: null,
          scopes: ['user:inference'],
          subscriptionType: null,
          rateLimitTier: null,
        },
        'raw contrast does not carry environment account metadata',
      )

      const first = applyTarget117OauthEnvAccountMetadataSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.deepEqual(
        { status: first.status, replacements: first.replacements, ownerOverrides: first.ownerOverrides },
        { status: 'recovered', replacements: 2, ownerOverrides: 1 },
      )
      const second = applyTarget117OauthEnvAccountMetadataSourceRecovery({
        sourceRoot: raw.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      const outputSource = verifyOutput(raw.sourceRoot).toString('utf8')
      const outputAst = parseSource(ts, fixture.inputs.sourceFile.path, outputSource)
      const outputDeclaration = assertDeclaration(
        ts,
        outputAst,
        outputSource,
        fixture.inputs.sourceFile.outputDeclaration,
      )
      const outputCallback = assertEnvironmentMetadataAst(
        ts,
        outputAst,
        outputDeclaration,
      )

      const direct = executeCallback(ts, outputAst, outputSource, outputCallback, {
        env: {
          CLAUDE_CODE_OAUTH_TOKEN: 'direct-token',
          CLAUDE_CODE_SUBSCRIPTION_TYPE: 'max',
          CLAUDE_CODE_RATE_LIMIT_TIER: 'tier-a',
        },
      })
      assert.deepEqual(direct.value, {
        accessToken: 'direct-token',
        refreshToken: null,
        expiresAt: null,
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'tier-a',
      })
      assert.equal(direct.storageReads, 0)

      const fileDescriptor = executeCallback(
        ts,
        outputAst,
        outputSource,
        outputCallback,
        {
          env: {
            CLAUDE_CODE_SUBSCRIPTION_TYPE: 'team',
            CLAUDE_CODE_RATE_LIMIT_TIER: 'tier-b',
          },
          fileDescriptorToken: 'fd-token',
        },
      )
      assert.deepEqual(fileDescriptor.value, {
        accessToken: 'fd-token',
        refreshToken: null,
        expiresAt: null,
        scopes: ['user:inference'],
        subscriptionType: 'team',
        rateLimitTier: 'tier-b',
      })
      assert.equal(fileDescriptor.storageReads, 0)

      const storedTokens = {
        accessToken: 'stored-token',
        refreshToken: 'refresh-token',
        expiresAt: 123,
        scopes: ['user:inference'],
        subscriptionType: 'pro',
        rateLimitTier: 'stored-tier',
      }
      const stored = executeCallback(ts, outputAst, outputSource, outputCallback, {
        env: {
          CLAUDE_CODE_SUBSCRIPTION_TYPE: 'enterprise',
          CLAUDE_CODE_RATE_LIMIT_TIER: 'ignored-tier',
        },
        storageData: { claudeAiOauth: storedTokens },
      })
      assert.equal(stored.value, storedTokens, 'secure-storage branch remains unchanged')
      assert.equal(stored.storageReads, 1)
      assert.equal(stored.loggedErrors, 0)

      const bare = executeCallback(ts, outputAst, outputSource, outputCallback, {
        bare: true,
        env: { CLAUDE_CODE_OAUTH_TOKEN: 'ignored' },
      })
      assert.equal(bare.value, null)
      assert.equal(bare.storageReads, 0)
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
      'target117-oauth-metadata-packaged-',
    )
    try {
      const result = applyTarget117OauthEnvAccountMetadataSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      verifyOutput(packaged.sourceRoot)
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 OAuth metadata replay rejects mutation before writing',
  { skip: !selected },
  () => {
    const raw = materializeRawSource('target117-oauth-metadata-mutated-raw-')
    try {
      const filename = sourceFilename(raw.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget117OauthEnvAccountMetadataSourceRecovery({
            sourceRoot: raw.sourceRoot,
          }),
        /refusing non-target OAuth metadata recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const output = materializeRawSource('target117-oauth-metadata-mutated-output-')
    try {
      applyTarget117OauthEnvAccountMetadataSourceRecovery({
        sourceRoot: output.sourceRoot,
      })
      const filename = sourceFilename(output.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget117OauthEnvAccountMetadataSourceRecovery({
            sourceRoot: output.sourceRoot,
          }),
        /refusing non-target OAuth metadata recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)
    } finally {
      fs.rmSync(output.temporaryRoot, { recursive: true, force: true })
    }
  },
)
