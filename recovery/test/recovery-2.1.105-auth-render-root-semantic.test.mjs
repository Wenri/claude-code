import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
      : false,
}
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

const units = new Map([
  [
    9989,
    [
      'unresolved',
      8104185,
      8105386,
      'FunctionDeclaration',
      'f6ab1de88b90e90bb1f966db39329bea9e7f3b6ebed9c7abbb38c4a91ff49bc6',
    ],
  ],
  [
    9990,
    [
      'unresolved',
      8105386,
      8105668,
      'FunctionDeclaration',
      'ad8babd8296c2b6b9f01dad6077d13814b5d9e156b26d0a1799aef8b18ed052c',
    ],
  ],
  [
    19107,
    [
      'unresolved',
      13549399,
      13604560,
      'FunctionDeclaration',
      '9a4b0aee2b5e06161abe44cd8f91c64a7333e23a736e273ce8851e9dcf8e3725',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function functionText(contents, name) {
  const ts = await loadTypeScript()
  const tree = ts.createSourceFile(
    'owner.ts',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = tree.statements.find(
    node =>
      ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.ok(declaration, `${name}: function declaration`)
  return {
    text: declaration.getText(tree),
    parameters: declaration.parameters.map(parameter =>
      parameter.name.getText(tree),
    ),
  }
}

test(
  'authenticated target105 pins the rendered auth handlers and root-creation call path',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.deepEqual(
        [
          region.classification,
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: structural identity`,
      )
      assert.equal(
        sha256(target.slice(identity[1], identity[2])),
        identity[4],
        `${index}: exact target bytes`,
      )
    }

    const targetStatus = target.slice(8104185, 8105386)
    const targetLogout = target.slice(8105386, 8105668)
    assert.equal(occurrences(targetStatus, '.render('), 1)
    assert.equal(occurrences(targetStatus, '.waitUntilExit()'), 1)
    assert.equal(occurrences(targetStatus, 'process.stdout'), 0)
    assert.match(targetStatus, /\.join\(`\n`\)/)
    assert.match(targetStatus, /process\.exit\([^?]+\?0:1\)/)
    assert.equal(occurrences(targetLogout, '.render('), 1)
    assert.equal(occurrences(targetLogout, '.waitUntilExit()'), 1)
    assert.equal(occurrences(targetLogout, 'process.stdout'), 0)

    const baselineCommandAt = baseline.indexOf('Show authentication status')
    const targetCommandAt = target.indexOf('Show authentication status')
    assert.ok(baselineCommandAt > 0 && targetCommandAt > 0)
    const baselineCommands = baseline.slice(
      baselineCommandAt,
      baselineCommandAt + 700,
    )
    const targetCommands = target.slice(targetCommandAt, targetCommandAt + 900)
    assert.equal(occurrences(baselineCommands, 'createSubcommandRoot'), 0)
    assert.equal(occurrences(baselineCommands, 'Promise.all(['), 0)
    assert.equal(occurrences(targetCommands, 'createSubcommandRoot'), 2)
    assert.equal(occurrences(targetCommands, 'Promise.all(['), 2)
    assert.match(targetCommands, /process\.exit\(0\)/)
  },
)

test(
  'source AST renders status and logout exactly once before waiting for root exit',
  sourceOptions,
  async () => {
    const auth = source('cli/handlers/auth.ts')
    const status = await functionText(auth, 'authStatus')
    const logout = await functionText(auth, 'authLogout')

    assert.deepEqual(status.parameters, ['root', 'opts'])
    assert.deepEqual(logout.parameters, ['root'])
    assert.equal(occurrences(status.text, 'root.render('), 1)
    assert.equal(occurrences(status.text, 'await root.waitUntilExit()'), 1)
    assert.equal(occurrences(status.text, 'process.stdout.write'), 0)
    assert.ok(status.text.includes("lines.join('\\n')"))
    assert.ok(status.text.includes('process.exit(loggedIn ? 0 : 1)'))
    assert.equal(occurrences(logout.text, 'root.render('), 1)
    assert.equal(occurrences(logout.text, 'await root.waitUntilExit()'), 1)
    assert.equal(occurrences(logout.text, 'process.stdout.write'), 0)
    assert.equal(occurrences(logout.text, 'process.exit(0)'), 0)
    assert.ok(
      logout.text.includes(
        "'Successfully logged out from your Anthropic account.'",
      ),
    )
  },
)

test(
  'source command registration creates an Ink root for both handlers and owns logout success exit',
  sourceOptions,
  () => {
    const main = source('main.tsx')
    const start = main.indexOf("auth.command('status')")
    const end = main.indexOf('/**', start)
    assert.ok(start > 0 && end > start, 'auth command registration block')
    const commands = main.slice(start, end)
    assert.equal(occurrences(commands, 'Promise.all(['), 2)
    assert.equal(occurrences(commands, 'createSubcommandRoot'), 4)
    assert.ok(
      commands.includes(
        'await authStatus(await createSubcommandRoot(), opts)',
      ),
    )
    assert.ok(
      commands.includes('await authLogout(await createSubcommandRoot())'),
    )
    assert.ok(commands.includes('process.exit(0)'))
  },
)
