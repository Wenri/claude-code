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
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const exportUnit = {
  end: 10944367,
  index: 17550,
  nodeType: 'ExpressionStatement',
  sourceHash:
    'f8543462ea83e5bd55810d72747bc623c97b06dbc720a5606d7512d3999132f0',
  start: 10941211,
}
const supportingUnits = new Map([
  [
    'getMaterializedSessionFile',
    {
      end: 10945012,
      index: 17558,
      name: 'tO6',
      sourceHash:
        'ec1cccde0f862809cb934eb38594d225f2ee6dae5434da576c5a635b0c3b3c85',
      start: 10944967,
    },
  ],
  [
    'cacheAgentName',
    {
      end: 10970534,
      index: 17638,
      name: 'lM6',
      sourceHash:
        'ae89792044ad6719774c3831177d8bbde5f8cddbe211fd4ffd4946bc70c8762b',
      start: 10970476,
    },
  ],
])
const residueRanges = new Map([
  ['getMaterializedSessionFile', [10943319, 10943345]],
  ['cacheAgentName', [10944193, 10944207]],
])
const sourceHashes = new Map([
  [
    'getMaterializedSessionFile',
    '37de7e6f5eea570cfbe67233a6d9cbfa6ddcd0dbfa88d896a183e8eb318e942e',
  ],
  [
    'cacheAgentName',
    'd9a783bea6c2ec3660df29786824c5152459a3e02c747fe9f0e3c3ab3423aee3',
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function propertyPositions(source, names) {
  const wanted = new Set(names)
  const positions = new Map(names.map(name => [name, []]))
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  walk(ast, node => {
    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.type === 'Identifier')
    if (!isProperty) return
    const property = node.key ?? node.property
    if (wanted.has(property.name)) {
      positions.get(property.name).push([property.start, property.end])
    }
  })
  return positions
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba') {
    return bytes.toString('utf8')
  }
  assert.equal(
    digest,
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
  )
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(
    sha256(inner),
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  )
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

function parseSessionStorage(ts, root) {
  const filename = path.join(root, 'utils/sessionStorage.ts')
  assert.ok(fs.existsSync(filename), 'sessionStorage source owner exists')
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return { parsed, source }
}

function findFunction(ts, parsed, name) {
  let found
  function visit(node) {
    if (
      !found &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
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

test(
  'selected source pins both recovered target113 session accessors',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    const source = parseSessionStorage(ts, selectedSourceRoot)
    for (const [name, digest] of sourceHashes) {
      const declaration = findFunction(ts, source.parsed, name)
      assert.ok(declaration, name)
      assert.equal(sha256(declaration.getText(source.parsed)), digest)
    }
    const accessor = findFunction(
      ts,
      source.parsed,
      'getMaterializedSessionFile',
    )
    assert.match(
      accessor.getText(source.parsed),
      /return project\?\.sessionFile \?\? null/,
    )
    assert.doesNotMatch(accessor.getText(source.parsed), /getProject\(/)
  },
)

test(
  'comparison source root proves both accessor declarations were omitted',
  {
    skip:
      !selected ||
      historicalPackageSelected ||
      comparisonSourceRoot === recoveredSourceRoot
        ? 'a distinct materialized source root is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const source = parseSessionStorage(ts, comparisonSourceRoot)
    for (const name of supportingUnits.keys()) {
      assert.equal(findFunction(ts, source.parsed, name), undefined, name)
    }
  },
)

test(
  'authenticated target pins the exact export residues and backing declarations',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    const target = authenticatedTargetInner(targetPath)
    const region = structural.regions[exportUnit.index]
    assert.deepEqual(
      [
        region.classification,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        'unresolved',
        exportUnit.start,
        exportUnit.end,
        exportUnit.nodeType,
        exportUnit.sourceHash,
      ],
    )
    assert.equal(
      sha256(target.slice(exportUnit.start, exportUnit.end)),
      exportUnit.sourceHash,
    )
    const names = [...supportingUnits.keys()]
    const baselineProperties = propertyPositions(
      baselineBytes.toString('utf8'),
      names,
    )
    const targetProperties = propertyPositions(target, names)
    for (const name of names) {
      assert.deepEqual(baselineProperties.get(name), [], `${name}: baseline zero`)
      assert.deepEqual(
        targetProperties.get(name),
        [residueRanges.get(name)],
        `${name}: exact target ordinal one`,
      )
      const unit = supportingUnits.get(name)
      const supportingRegion = structural.regions[unit.index]
      assert.deepEqual(
        [
          supportingRegion.target.start,
          supportingRegion.target.end,
          supportingRegion.target.sourceHash,
        ],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
      )
    }
  },
)

test(
  'target and source preserve non-materializing inspection and agent-name notification',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const target = authenticatedTargetInner(targetPath)
    const source = parseSessionStorage(ts, selectedSourceRoot)

    const accessorUnit = supportingUnits.get('getMaterializedSessionFile')
    for (const project of [undefined, { sessionFile: '/tmp/session.jsonl' }]) {
      const targetAccessor = compileTarget(
        target.slice(accessorUnit.start, accessorUnit.end),
        { g5H: project },
        accessorUnit.name,
      )
      const sourceAccessor = compileSource(
        ts,
        source.parsed,
        findFunction(ts, source.parsed, 'getMaterializedSessionFile'),
        { project },
        'getMaterializedSessionFile',
      )
      const expected = project?.sessionFile ?? null
      assert.equal(targetAccessor(), expected)
      assert.equal(sourceAccessor(), expected)
    }

    const nameUnit = supportingUnits.get('cacheAgentName')
    const targetState = {}
    const sourceState = {}
    let targetEmits = 0
    let sourceEmits = 0
    const targetCache = compileTarget(
      target.slice(nameUnit.start, nameUnit.end),
      { T1: () => targetState, UM6: { emit: () => (targetEmits += 1) } },
      nameUnit.name,
    )
    const sourceCache = compileSource(
      ts,
      source.parsed,
      findFunction(ts, source.parsed, 'cacheAgentName'),
      {
        getProject: () => sourceState,
        sessionAgentNameChanged: { emit: () => (sourceEmits += 1) },
      },
      'cacheAgentName',
    )
    targetCache('coordinator')
    sourceCache('coordinator')
    assert.deepEqual(targetState, { currentSessionAgentName: 'coordinator' })
    assert.deepEqual(sourceState, targetState)
    assert.equal(targetEmits, 1)
    assert.equal(sourceEmits, 1)
  },
)
