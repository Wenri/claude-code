import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-remote-bundle-option-migration-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  '50001c437d414bc73f98820ee5bd703d8f820fe94e7a9fff3aba7f2db35b4a9f'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) return bytes.toString('utf8')
  assert.equal(digest, fixture.artifact.targetWrapperSha256)
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(sha256(inner), fixture.artifact.targetInnerSha256)
  return inner.toString('utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(root, owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(root, relative)
  const nested = path.join(root, owner)
  if (fs.existsSync(direct)) return direct
  if (fs.existsSync(nested)) return nested
  return null
}

function parseSource(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  assert.ok(filename, `${owner}: source file exists`)
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return parsed
}

function findFunction(ts, parsed, name) {
  let found
  function visit(node) {
    if (found) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.ok(found, `${name}: function declaration`)
  return found
}

function callsNamed(ts, declaration, name) {
  const calls = []
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === name) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === name))
    ) {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return calls
}

function propertyName(ts, property) {
  const name = property.name
  if (!name) return null
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null
}

function objectArgument(ts, call) {
  const argument = call.arguments[0]
  assert.ok(ts.isObjectLiteralExpression(argument), 'call has object argument')
  return argument
}

function assertObjectOmits(ts, object, omitted) {
  assert.equal(
    object.properties.some(property => propertyName(ts, property) === omitted),
    false,
    `object omits ${omitted}`,
  )
}

function defaultedBinding(ts, declaration, name) {
  let found
  function visit(node) {
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

function negatedIdentifierUses(ts, declaration, name) {
  const found = []
  function visit(node) {
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isIdentifier(node.operand) &&
      node.operand.text === name
    ) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

function negatedPropertyUses(ts, declaration, object, name) {
  const found = []
  function visit(node) {
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isPropertyAccessExpression(node.operand) &&
      ts.isIdentifier(node.operand.expression) &&
      node.operand.expression.text === object &&
      node.operand.name.text === name
    ) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

function optionalPropertySignatures(ts, declaration, name) {
  const found = []
  function visit(node) {
    if (
      ts.isPropertySignature(node) &&
      node.questionToken &&
      propertyName(ts, node) === name
    ) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

function targetAllowBundleOccurrences(fragment, offset) {
  const ast = parse(fragment, { ecmaVersion: 'latest', sourceType: 'module' })
  const rows = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    const key =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : node.type === 'Property' &&
            !node.computed &&
            node.key?.type === 'Identifier'
          ? node.key
          : null
    if (key?.name === 'allowBundle') {
      rows.push({
        end: offset + key.end,
        node,
        start: offset + key.start,
      })
    }
    for (const [name, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(name)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return { ast, rows }
}

function targetIdentity(row) {
  const region = structural.regions[row.targetIndex]
  assert.equal(region?.target?.index, row.targetIndex)
  assert.deepEqual(
    {
      classification: region.classification,
      end: region.target.end,
      nodeType: region.target.nodeType,
      sourceHash: region.target.sourceHash,
      start: region.target.start,
    },
    row.target,
    `${row.targetIndex}: structural identity`,
  )
}

function compileTarget(fragment, dependencies, name) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return ${name}`,
  )(...Object.values(dependencies))
}

function compileSource(ts, parsed, declaration, dependencies, name) {
  const source = declaration.getText(parsed).replace(/^export\s+/, '')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    ...Object.keys(dependencies),
    `${output}; return ${name}`,
  )(...Object.values(dependencies))
}

test('the option-migration fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    targetUnits: 5,
    targetResidues: 7,
    bridgeUnits: 1,
    bridgeResidues: 2,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [10616, 11845, 11848, 16495, 16538],
  )
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    7,
  )
  for (const row of [...fixture.rows, fixture.bridge]) targetIdentity(row)
})

test(
  'dual-root source declarations pin the skipBundle inversion and omitted-option call graph',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    const declarations = new Map()
    for (const [id, expected] of Object.entries(fixture.sourceDeclarations)) {
      const parsed = parseSource(ts, sourceRoot, expected.owner)
      const declaration = findFunction(ts, parsed, expected.name)
      const digest = sha256(declaration.getText(parsed))
      assert.ok(
        expected.forms.some(form => form.sha256 === digest),
        `${id}: exact known source form ${digest}`,
      )
      declarations.set(id, { declaration, parsed })
    }

    const core = declarations.get('eligibilityCore').declaration
    const coreText = core.getText(declarations.get('eligibilityCore').parsed)
    const coreBinding = defaultedBinding(ts, core, 'skipBundle')
    assert.ok(coreBinding, 'eligibility core binds skipBundle')
    assert.equal(coreBinding.initializer?.kind, ts.SyntaxKind.FalseKeyword)
    assert.equal(optionalPropertySignatures(ts, core, 'skipBundle').length, 1)
    assert.equal(negatedIdentifierUses(ts, core, 'skipBundle').length, 1)
    for (const fragment of [
      'process.env.CCR_FORCE_BUNDLE',
      'process.env.CCR_ENABLE_BUNDLE',
      "'tengu_ccr_bundle_seed_enabled'",
    ]) {
      assert.ok(coreText.includes(fragment), `eligibility core: ${fragment}`)
    }

    const wrapper = declarations.get('eligibilityWrapper').declaration
    const wrapperBinding = defaultedBinding(ts, wrapper, 'skipBundle')
    assert.ok(wrapperBinding, 'eligibility wrapper binds skipBundle')
    assert.equal(wrapperBinding.initializer?.kind, ts.SyntaxKind.FalseKeyword)
    const forwarded = callsNamed(
      ts,
      wrapper,
      'checkBackgroundRemoteSessionEligibility',
    )
    assert.equal(forwarded.length, 1)
    assert.ok(
      objectArgument(ts, forwarded[0]).properties.some(
        property =>
          ts.isShorthandPropertyAssignment(property) &&
          property.name.text === 'skipBundle',
      ),
      'eligibility wrapper forwards skipBundle unchanged',
    )

    const teleport = declarations.get('teleportCore').declaration
    assert.equal(optionalPropertySignatures(ts, teleport, 'skipBundle').length, 1)
    assert.equal(
      negatedPropertyUses(ts, teleport, 'options', 'skipBundle').length,
      2,
    )

    const teleportWrapper = declarations.get('teleportWrapper').declaration
    const wrapperCalls = callsNamed(ts, teleportWrapper, 'teleportToRemote')
    assert.equal(wrapperCalls.length, 1)
    assertObjectOmits(ts, objectArgument(ts, wrapperCalls[0]), 'skipBundle')

    const review = declarations.get('reviewCaller').declaration
    const reviewEligibility = callsNamed(ts, review, 'checkRemoteAgentEligibility')
    assert.equal(reviewEligibility.length, 1)
    assert.equal(reviewEligibility[0].arguments.length, 0)

    const ultraplan = declarations.get('ultraplanCaller').declaration
    const ultraplanEligibility = callsNamed(
      ts,
      ultraplan,
      'checkRemoteAgentEligibility',
    )
    assert.equal(ultraplanEligibility.length, 1)
    assert.equal(ultraplanEligibility[0].arguments.length, 0)
    const ultraplanTeleport = callsNamed(ts, ultraplan, 'teleportToRemote')
    assert.equal(ultraplanTeleport.length, 1)
    assertObjectOmits(ts, objectArgument(ts, ultraplanTeleport[0]), 'skipBundle')
  },
)

test(
  'authenticated target113 pins the exact positive-option family and forwarding bridge',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const target = authenticatedTargetInner(targetPath)
    const fragments = new Map()
    for (const row of [...fixture.rows, fixture.bridge]) {
      const fragment = target.slice(row.target.start, row.target.end)
      fragments.set(row.targetIndex, fragment)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, rows } = targetAllowBundleOccurrences(
        fragment,
        row.target.start,
      )
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, row.target.nodeType)
      assert.deepEqual(
        rows.map(item => [item.start, item.end]),
        row.residues.map(residue => [residue.start, residue.end]),
        `${row.targetIndex}: exact allowBundle occurrences`,
      )
      if ([11845, 16495, 16538].includes(row.targetIndex)) {
        for (const item of rows) {
          assert.equal(item.node.type, 'Property')
          assert.deepEqual(
            {
              argument: item.node.value.argument?.value,
              operator: item.node.value.operator,
              type: item.node.value.type,
            },
            { argument: 0, operator: '!', type: 'UnaryExpression' },
          )
        }
      }
      if (row.targetIndex === 11848) {
        assert.ok(rows.every(item => item.node.type === 'MemberExpression'))
      }
    }

    const targetEligibility = compileTarget(
      fragments.get(10616),
      {
        Av: async () => true,
        LDH: async () => true,
        QbK: async () => [{ environment_id: 'env', kind: 'byoc' }],
        SH: () => false,
        VN: async () => null,
        k6: () => ({ remote: { defaultEnvironmentId: 'env' } }),
        o_: () => true,
        sp$: async () => false,
        tp$: () => true,
      },
      'nbK',
    )
    assert.deepEqual(await targetEligibility({ allowBundle: false }), [
      { type: 'no_git_remote' },
    ])
    assert.deepEqual(await targetEligibility({ allowBundle: true }), [])

    const forwarded = []
    const targetWrapper = compileTarget(
      fragments.get(11855),
      {
        nbK: async options => {
          forwarded.push(options)
          return []
        },
      },
      'aIH',
    )
    assert.deepEqual(await targetWrapper(), { eligible: true })
    assert.deepEqual(await targetWrapper({ allowBundle: true }), {
      eligible: true,
    })
    assert.deepEqual(forwarded, [
      { allowBundle: false },
      { allowBundle: true },
    ])

    let teleportOptions
    const targetTeleportWrapper = compileTarget(
      fragments.get(11845),
      {
        UQ9: async () => undefined,
        ct: options => {
          teleportOptions = options
          return 'session'
        },
      },
      'd$6',
    )
    assert.equal(
      await targetTeleportWrapper(
        'root',
        'message',
        'signal',
        'source',
        'branch',
      ),
      'session',
    )
    assert.equal(teleportOptions.allowBundle, true)
    assert.equal(teleportOptions.initialMessage, 'message')
    assert.equal(teleportOptions.source, 'source')
    assert.equal(teleportOptions.branchName, 'branch')
  },
)

test(
  'target allowBundle and source skipBundle have an exact complementary truth table',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const target = authenticatedTargetInner(targetPath)
    const targetRow = fixture.rows.find(row => row.targetIndex === 10616)
    const targetEligibility = compileTarget(
      target.slice(targetRow.target.start, targetRow.target.end),
      {
        Av: async () => true,
        LDH: async () => true,
        QbK: async () => [{ environment_id: 'env', kind: 'byoc' }],
        SH: () => false,
        VN: async () => null,
        k6: () => ({ remote: { defaultEnvironmentId: 'env' } }),
        o_: () => true,
        sp$: async () => false,
        tp$: () => true,
      },
      'nbK',
    )

    const expectedSource = fixture.sourceDeclarations.eligibilityCore
    const parsed = parseSource(ts, sourceRoot, expectedSource.owner)
    const declaration = findFunction(ts, parsed, expectedSource.name)
    const sourceEligibility = compileSource(
      ts,
      parsed,
      declaration,
      {
        checkGate_CACHED_OR_BLOCKING: async () => true,
        checkGithubAppInstalled: async () => true,
        checkHasRemoteEnvironment: async () => true,
        checkIsInGitRepo: () => true,
        checkNeedsClaudeAiLogin: async () => false,
        detectCurrentRepositoryWithHost: async () => null,
        findGitRoot: () => '/repo',
        getCwd: () => '/repo',
        isEnvTruthy: () => false,
        isPolicyAllowed: () => true,
      },
      expectedSource.name,
    )

    for (const allowBundle of [false, true]) {
      assert.deepEqual(
        await targetEligibility({ allowBundle }),
        await sourceEligibility({ skipBundle: !allowBundle }),
        `allowBundle=${allowBundle} is skipBundle=${!allowBundle}`,
      )
    }
    assert.deepEqual(
      await targetEligibility({ allowBundle: true }),
      await sourceEligibility(),
      'omitted source skipBundle defaults false and represents target allowBundle:true',
    )
    assert.deepEqual(
      await targetEligibility(),
      await sourceEligibility({ skipBundle: true }),
      'target default allowBundle:false maps to explicit source skipBundle:true',
    )
  },
)
