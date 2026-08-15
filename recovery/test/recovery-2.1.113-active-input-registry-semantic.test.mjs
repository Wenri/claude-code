import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.112, 2.1.113, and 2.1.116 bundles are required'
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
    364,
    [
      24489,
      31107,
      'ExpressionStatement',
      '03a11f2f745b2e227e947b3efd00e71a8db87bb2400e6cb181c59939f62c13df',
    ],
  ],
  [
    365,
    [
      31107,
      33672,
      'FunctionDeclaration',
      '088ddde054327aa11d6923b9822620c58fc2c5ec9fabf7b2040d1ad7fe458424',
    ],
  ],
  [
    564,
    [
      45557,
      45654,
      'FunctionDeclaration',
      'cbb3cb218a05c5cbeab1054e6e9680f6192840f93e2226f25db507c6a41ac3d7',
    ],
  ],
  [
    565,
    [
      45654,
      45706,
      'FunctionDeclaration',
      '36afdc1c33cea1078ed0e51e5d799ee9058795a34a2a2f2a66174b21b23bd543',
    ],
  ],
  [
    566,
    [
      45706,
      45748,
      'FunctionDeclaration',
      'bf4eacd664ccb522d8de292fbad97bd0f4eadac1b0733ffa6d638b6448058887',
    ],
  ],
  [
    567,
    [
      45748,
      45808,
      'FunctionDeclaration',
      '8fb1654072bb06cc3635d32086222691fa72ae59246736601d90c4870762e6d9',
    ],
  ],
  [
    568,
    [
      45808,
      45863,
      'FunctionDeclaration',
      '08f7b052327cf643c0badda18f9cb44e848820f829ff6108b07a994d1e22eefb',
    ],
  ],
  [
    15800,
    [
      9967615,
      9977541,
      'FunctionDeclaration',
      '8884039c654ccf4d7ae4afc0635de9679809d7ef25f86e623249d5096578cfaf',
    ],
  ],
])

const functionNames = [
  'activateInput',
  'deactivateInput',
  'clearInputsForServer',
  'isInputActive',
  'getActiveInputsForServer',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`export function ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function executeActiveInputFunctions(contents) {
  const ts = await loadTypeScript()
  const declarations = functionNames
    .map(name => functionSource(contents, name))
    .join('\n')
  const javascript = ts.transpileModule(
    `
      const STATE = { activeInputs: new Map<string, Set<string>>() }
      ${declarations}
      export function stateMap() { return STATE.activeInputs }
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target113 pins active-input state, public operations, and disconnect cleanup reachability',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    assert.equal(
      sha256(targetBytes),
      '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'activeInputs'), 0)
    assert.equal(occurrences(target, 'activeInputs'), 7)
    assert.equal(occurrences(latest, 'activeInputs'), 7)
    const expectedCounts = new Map([
      ['activateInput', 2],
      ['deactivateInput', 1],
      ['clearInputsForServer', 1],
      ['isInputActive', 1],
      ['getActiveInputsForServer', 1],
    ])
    for (const [name, count] of expectedCounts) {
      assert.equal(occurrences(baseline, name), 0, `${name}: baseline`)
      assert.equal(occurrences(target, name), count, `${name}: target`)
      assert.equal(occurrences(latest, name), count, `${name}: latest`)
    }

    assert.ok(target.slice(31107, 33672).includes('activeInputs:new Map'))
    assert.ok(target.slice(45557, 45654).includes('new Set'))
    assert.ok(target.slice(45557, 45654).includes('.add('))
    assert.ok(target.slice(45654, 45706).includes('?.delete('))
    assert.ok(target.slice(45748, 45808).includes('?.has('))
    assert.ok(target.slice(45808, 45863).includes('??new Set'))
    assert.equal(occurrences(target.slice(9967615, 9977541), 'g2H('), 4)
  },
)

test(
  'source root owns the registry and clears it on every target113 MCP disconnect path',
  sourceOptions,
  () => {
    const state = source('bootstrap/state.ts')
    const connections = source('services/mcp/useManageMCPConnections.ts')

    assert.ok(state.includes('activeInputs: Map<string, Set<string>>'))
    assert.ok(state.includes('activeInputs: new Map()'))
    assert.ok(state.includes('let inputs = STATE.activeInputs.get(serverName)'))
    assert.ok(state.includes('STATE.activeInputs.set(serverName, inputs)'))
    assert.ok(state.includes('STATE.activeInputs.get(serverName)?.delete(inputId)'))
    assert.ok(state.includes('STATE.activeInputs.delete(serverName)'))
    assert.ok(
      state.includes(
        'return STATE.activeInputs.get(serverName)?.has(inputId) ?? false',
      ),
    )
    assert.ok(
      state.includes('return STATE.activeInputs.get(serverName) ?? new Set()'),
    )

    assert.equal(occurrences(connections, 'clearInputsForServer'), 5)
    assert.equal(
      occurrences(connections, 'clearInputsForServer(client.name)'),
      2,
    )
    assert.equal(occurrences(connections, 'clearInputsForServer(s.name)'), 1)
    assert.equal(
      occurrences(connections, 'clearInputsForServer(serverName)'),
      1,
    )
  },
)

test(
  'executable registry isolates servers and preserves missing-server Set semantics',
  sourceOptions,
  async () => {
    const registry = await executeActiveInputFunctions(
      source('bootstrap/state.ts'),
    )
    const missing = registry.getActiveInputsForServer('missing')
    missing.add('detached')
    assert.equal(registry.isInputActive('missing', 'detached'), false)
    assert.equal(registry.stateMap().has('missing'), false)

    registry.activateInput('alpha', 'one')
    registry.activateInput('alpha', 'two')
    registry.activateInput('beta', 'one')
    assert.equal(registry.isInputActive('alpha', 'one'), true)
    assert.deepEqual(
      [...registry.getActiveInputsForServer('alpha')].sort(),
      ['one', 'two'],
    )
    assert.deepEqual([...registry.getActiveInputsForServer('beta')], ['one'])

    registry.deactivateInput('alpha', 'one')
    assert.equal(registry.isInputActive('alpha', 'one'), false)
    assert.equal(registry.isInputActive('alpha', 'two'), true)
    registry.clearInputsForServer('alpha')
    assert.equal(registry.stateMap().has('alpha'), false)
    assert.equal(registry.isInputActive('beta', 'one'), true)
  },
)
