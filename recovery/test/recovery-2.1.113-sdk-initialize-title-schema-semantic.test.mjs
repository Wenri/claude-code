import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
const description =
  'Custom session title. When provided, the session uses this title and skips automatic title generation. Has no effect on the persisted title when resuming an existing session.'
const titlePropertySha256 =
  'bbd1717fe665fe604f3364c6415e1e21ab01b67263dace14430068039c291a85'
const unit = {
  end: 11922695,
  index: 19497,
  nodeType: 'VariableDeclaration',
  sourceHash:
    'c0d1a5a8bf909d05b4c8c87c5ef9ffbad45303501a7cbf294f6adb185661d2d1',
  start: 11908635,
}
const residueRange = [11909971, 11910147]
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

function stringPositions(source, value) {
  const positions = []
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  walk(ast, node => {
    if (node.type === 'Literal' && node.value === value) {
      positions.push([node.start, node.end])
    } else if (
      node.type === 'TemplateElement' &&
      (node.value?.cooked ?? node.value?.raw) === value
    ) {
      positions.push([node.start, node.end])
    }
  })
  return positions
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (
    digest ===
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
  ) {
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

function parseOwner(ts, root) {
  const filename = path.join(root, 'entrypoints/sdk/controlSchemas.ts')
  assert.ok(fs.existsSync(filename), 'SDK control-schema owner exists')
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

function findInitializeDeclaration(ts, parsed) {
  return parsed.statements.find(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'SDKControlInitializeRequestSchema',
      ),
  )
}

function findTitleProperty(ts, parsed, declaration) {
  let found
  function visit(node) {
    if (
      !found &&
      ts.isPropertyAssignment(node) &&
      node.name.getText(parsed) === 'title' &&
      node.getText(parsed).includes(description)
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return found
}

test(
  'selected source restores the exact SDK initialize title field',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    const owner = parseOwner(ts, selectedSourceRoot)
    const declaration = findInitializeDeclaration(ts, owner.parsed)
    assert.ok(declaration)
    const property = findTitleProperty(ts, owner.parsed, declaration)
    assert.ok(property)
    const fragment = property.getText(owner.parsed)
    assert.equal(sha256(fragment), titlePropertySha256)
    assert.match(
      fragment,
      /^title: z\s*\.string\(\)\s*\.optional\(\)\s*\.describe\(/,
    )
  },
)

test(
  'comparison source proves the target113 title field was omitted',
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
    const owner = parseOwner(ts, comparisonSourceRoot)
    const declaration = findInitializeDeclaration(ts, owner.parsed)
    assert.ok(declaration)
    assert.equal(findTitleProperty(ts, owner.parsed, declaration), undefined)
    assert.equal(declaration.getText(owner.parsed).includes(description), false)
  },
)

test(
  'authenticated target pins u19497 and its sole target-added description',
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
    const baseline = baselineBytes.toString('utf8')
    const target = authenticatedTargetInner(targetPath)
    const region = structural.regions[unit.index]
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
        unit.start,
        unit.end,
        unit.nodeType,
        unit.sourceHash,
      ],
    )
    const fragment = target.slice(unit.start, unit.end)
    assert.equal(sha256(fragment), unit.sourceHash)
    assert.equal(fragment.includes(description), true)
    assert.match(
      fragment,
      /title:[^.]+\.string\(\)\.optional\(\)\.describe\("Custom session title\./,
    )
    assert.deepEqual(stringPositions(baseline, description), [])
    assert.deepEqual(stringPositions(target, description), [residueRange])
  },
)

test(
  'recovered SDK schema accepts, documents, and validates session titles',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  () => {
    const owner = path.join(
      selectedSourceRoot,
      'entrypoints/sdk/controlSchemas.ts',
    )
    const bun = path.join(repositoryRoot, '.pixi/envs/default/bin/bun')
    const expression = `
      import { SDKControlInitializeRequestSchema } from ${JSON.stringify(owner)};
      const schema = SDKControlInitializeRequestSchema();
      const accepted = schema.parse({subtype:'initialize',title:'Roadmap'});
      const invalid = schema.safeParse({subtype:'initialize',title:42}).success;
      console.log(JSON.stringify({accepted,invalid,description:schema.shape.title.description}));
    `
    const result = spawnSync(bun, ['-e', expression], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const parsed = JSON.parse(result.stdout)
    assert.deepEqual(parsed.accepted, {
      subtype: 'initialize',
      title: 'Roadmap',
    })
    assert.equal(parsed.invalid, false)
    assert.equal(parsed.description, description)
  },
)
