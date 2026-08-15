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
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const historicalPackageSelected = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
)
const selectedSourceRoot = historicalPackageSelected
  ? comparisonSourceRoot
  : recoveredSourceRoot
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const structuralBytes = fs.readFileSync(
  path.join(
    repositoryRoot,
    'recovery/cases',
    caseName,
    'structural/generated-delta.json.gz',
  ),
)
const structural = JSON.parse(gunzipSync(structuralBytes))

const artifacts = {
  baselineSha256:
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  structuralGzipSha256:
    '383448923995bb86060ce91beac2bc5adac35817a0cdff35b533135c7d24345f',
  targetInnerSha256:
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  targetWrapperPrefixLength: 87,
  targetWrapperSha256:
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
  targetWrapperSuffixLength: 3,
}

const units = [
  {
    index: 20409,
    target: [
      'unresolved',
      12901875,
      12902106,
      'FunctionDeclaration',
      '2d8a221cfdca9ece97e34147f1d9a338135efc18ac8f19bbe3245ae962823959',
    ],
    residues: [
      ['property', 'readFile', 12901918, 12901926, 66, 174],
      ['property', 'pid', 12902041, 12902044, 136, 137],
    ],
  },
  {
    index: 20413,
    target: [
      'unresolved',
      12902377,
      12902461,
      'VariableDeclaration',
      '2393d19cdd3ff9e7afd2df1ff90c5e2bb1f67fb4af9e1244c0fd34c7c88d59fa',
    ],
    residues: [['string', 'fs/promises', 12902424, 12902437, 156, 165]],
  },
]

const sourceHashes = new Map([
  [
    'DaemonLock',
    'b264518043c8b69d9f00b6b33c88b3866689bd5bc3903c55575f69da71379f13',
  ],
  [
    'DAEMON_LOCK_FILENAME',
    '00351cfc153b9fcc9e02f018d35ae6d7578b548ab2c768d19428abaa05ea2e39',
  ],
  [
    'getDaemonLockPath',
    'cecedcb139a9eb0d2cfa2a144d1263582182a90eb6b963215a0ca856762c0795',
  ],
  [
    'readDaemonLock',
    '77b9c681c5497d0a87de408c3a3222efaffcde3dba0bf805118e641c48b6fe6d',
  ],
])

const requiredImports = [
  ['node:fs/promises', 'readFile', 'readFile'],
  ['node:path', 'join', 'join'],
  ['src/utils/envUtils.js', 'getClaudeConfigHomeDir', 'getClaudeConfigHomeDir'],
  ['src/utils/errors.js', 'isENOENT', 'isENOENT'],
  ['src/utils/json.js', 'safeParseJSON', 'safeParseJSON'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function collectOccurrences(source) {
  const grouped = new Map()
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  function add(kind, value, start, end) {
    const key = identity(kind, value)
    const occurrences = grouped.get(key) ?? []
    occurrences.push([start, end])
    grouped.set(key, occurrences)
  }
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node.start, node.end)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
    }
    const property =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
              node.type,
            ) &&
              !node.computed &&
              node.key?.type === 'Identifier'
          ? node.key
          : null
    if (property) add('property', property.name, property.start, property.end)
  })
  return { ast, grouped }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === artifacts.targetInnerSha256) return bytes.toString('utf8')
  assert.equal(digest, artifacts.targetWrapperSha256)
  const inner = bytes.subarray(
    artifacts.targetWrapperPrefixLength,
    bytes.length - artifacts.targetWrapperSuffixLength,
  )
  assert.equal(sha256(inner), artifacts.targetInnerSha256)
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

function parseUpdate(ts, root) {
  const filename = path.join(root, 'cli/update.ts')
  assert.ok(fs.existsSync(filename), 'cli/update.ts source owner exists')
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${filename}: parses`)
  return { filename, parsed, source }
}

function findDeclaration(ts, parsed, name) {
  let found
  function visit(node) {
    if (found) return
    if (
      (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.name?.text === name
    ) {
      found = node
      return
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function runtimeImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause.isTypeOnly) continue
    const bindings = clause.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue
      imports.push([
        module,
        element.propertyName?.text ?? element.name.text,
        element.name.text,
      ])
    }
  }
  return imports
}

function compileSourceReader(ts, owner) {
  const names = [
    'DAEMON_LOCK_FILENAME',
    'getDaemonLockPath',
    'readDaemonLock',
  ]
  const declarations = names.map(name => {
    const declaration = findDeclaration(ts, owner.parsed, name)
    assert.ok(declaration, name)
    return declaration.getText(owner.parsed)
  })
  const output = ts.transpileModule(declarations.join('\n'), {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return dependencies =>
    Function(
      ...Object.keys(dependencies),
      `${output}; return { getDaemonLockPath, readDaemonLock }`,
    )(...Object.values(dependencies))
}

function compileTargetReader(fragment, dependencies) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return Zt1`,
  )(...Object.values(dependencies))
}

function parseJSON(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isENOENT(error) {
  return error?.code === 'ENOENT'
}

test('target113 daemon-lock units and exact added residues are authenticated', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
      : false,
  timeout: 90_000,
}, () => {
  assert.equal(sha256(structuralBytes), artifacts.structuralGzipSha256)
  const baselineBytes = fs.readFileSync(baselinePath)
  assert.equal(sha256(baselineBytes), artifacts.baselineSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = authenticatedTargetInner(targetPath)
  const baselineOccurrences = collectOccurrences(baseline).grouped
  const targetOccurrences = collectOccurrences(target).grouped

  for (const unit of units) {
    const region = structural.regions[unit.index]
    assert.equal(region?.target?.index, unit.index)
    assert.deepEqual(
      [
        region.classification,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      unit.target,
      `${unit.index}: structural identity`,
    )
    const [, start, end, nodeType, sourceHash] = unit.target
    const fragment = target.slice(start, end)
    assert.equal(sha256(fragment), sourceHash, `${unit.index}: target unit`)
    const unitAst = collectOccurrences(fragment).ast
    assert.equal(unitAst.body.length, 1)
    assert.equal(unitAst.body[0].type, nodeType)

    for (const [kind, value, residueStart, residueEnd, baselineCount, ordinal] of
      unit.residues) {
      const key = identity(kind, value)
      const baselineRows = baselineOccurrences.get(key) ?? []
      const targetRows = targetOccurrences.get(key) ?? []
      assert.equal(baselineRows.length, baselineCount, `${unit.index}: ${key}`)
      assert.deepEqual(
        targetRows[ordinal - 1],
        [residueStart, residueEnd],
        `${unit.index}: exact ${key} ordinal`,
      )
      assert.ok(ordinal > baselineCount, `${unit.index}: target-added ${key}`)
    }
  }

  const importFragment = target.slice(units[1].target[1], units[1].target[2])
  const loaded = []
  const fsPromises = { readFile: async () => '' }
  const pathModule = { join: path.join }
  const targetImports = Function(
    'v',
    'F$',
    'x$',
    'Uz',
    's$',
    'require',
    `let VA$, R5_; ${importFragment}; return { initialize: I5_, bindings: () => ({ VA$, R5_ }) }`,
  )(
    initialize => initialize,
    () => {},
    () => {},
    () => {},
    () => {},
    module => {
      loaded.push(module)
      if (module === 'fs/promises') return fsPromises
      if (module === 'path') return pathModule
      throw new Error(`unexpected target import: ${module}`)
    },
  )
  targetImports.initialize()
  assert.deepEqual(loaded, ['fs/promises', 'path'])
  assert.deepEqual(targetImports.bindings(), {
    VA$: fsPromises,
    R5_: pathModule,
  })
})

test('selected source root pins the exact daemon-lock declaration and import graph', {
  skip: !selected ? `not applicable to ${semanticCase}` : false,
}, async () => {
  const ts = await loadTypeScript()
  const owner = parseUpdate(ts, selectedSourceRoot)
  for (const [name, digest] of sourceHashes) {
    const declaration = findDeclaration(ts, owner.parsed, name)
    assert.ok(declaration, `${name}: recovered declaration`)
    assert.equal(
      sha256(declaration.getText(owner.parsed)),
      digest,
      `${name}: exact declaration`,
    )
  }
  const imports = runtimeImports(ts, owner.parsed)
  for (const expected of requiredImports) {
    assert.ok(
      imports.some(
        actual =>
          actual[0] === expected[0] &&
          actual[1] === expected[1] &&
          actual[2] === expected[2],
      ),
      `runtime import ${expected.join(':')}`,
    )
  }
})

test('pre-recovery comparison root omits the daemon-lock reader/import graph', {
  skip:
    !selected ||
    historicalPackageSelected ||
    comparisonSourceRoot === recoveredSourceRoot
      ? 'a distinct pre-recovery source root is required'
      : false,
}, async () => {
  const ts = await loadTypeScript()
  const owner = parseUpdate(ts, comparisonSourceRoot)
  for (const name of sourceHashes.keys()) {
    assert.equal(findDeclaration(ts, owner.parsed, name), undefined, name)
  }
  const imports = runtimeImports(ts, owner.parsed)
  for (const expected of requiredImports) {
    assert.equal(
      imports.some(
        actual =>
          actual[0] === expected[0] &&
          actual[1] === expected[1] &&
          actual[2] === expected[2],
      ),
      false,
      `omitted runtime import ${expected.join(':')}`,
    )
  }
})

test('authenticated target reader and selected source share fail-closed lock semantics', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetPath
      ? 'authenticated 2.1.113 bundle is required'
      : false,
}, async () => {
  const ts = await loadTypeScript()
  const owner = parseUpdate(ts, selectedSourceRoot)
  const makeSourceReader = compileSourceReader(ts, owner)
  const target = authenticatedTargetInner(targetPath)
  const targetFragment = target.slice(units[0].target[1], units[0].target[2])
  const expectedPath = path.join('/config-root', 'daemon.lock')

  async function readers(readFile) {
    const source = makeSourceReader({
      getClaudeConfigHomeDir: () => '/config-root',
      isENOENT,
      join: path.join,
      readFile,
      safeParseJSON: parseJSON,
    })
    assert.equal(source.getDaemonLockPath(), expectedPath)
    const targetReader = compileTargetReader(targetFragment, {
      $6: isENOENT,
      Gt1: () => expectedPath,
      S_: parseJSON,
      VA$: { readFile },
    })
    return [source.readDaemonLock, targetReader]
  }

  for (const [contents, expected] of [
    ['{"pid":42,"version":"2.1.113","extra":true}', {
      pid: 42,
      version: '2.1.113',
      extra: true,
    }],
    ['{"pid":"42","version":"2.1.113"}', null],
    ['{"pid":42,"version":113}', null],
    ['[]', null],
    ['{', null],
  ]) {
    let calls = 0
    const pair = await readers(async (filename, encoding) => {
      calls += 1
      assert.equal(filename, expectedPath)
      assert.equal(encoding, 'utf8')
      return contents
    })
    for (const reader of pair) assert.deepEqual(await reader(), expected)
    assert.equal(calls, 2)
  }

  const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
  for (const reader of await readers(async () => {
    throw missing
  })) {
    assert.equal(await reader(), null)
  }

  const denied = Object.assign(new Error('denied'), { code: 'EACCES' })
  for (const reader of await readers(async () => {
    throw denied
  })) {
    await assert.rejects(reader, error => error === denied)
  }
})
