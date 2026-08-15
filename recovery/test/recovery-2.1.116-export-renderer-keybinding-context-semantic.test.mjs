import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
      : false,
}

const units = new Map([
  [
    17306,
    [
      10794411,
      10794743,
      'f87846ba38a4c3331d1cc0d17af68aeb6923fecc53c6d770302795f660145049',
    ],
  ],
  [
    17458,
    [
      10855635,
      10856001,
      '033e73a0b6d8280ff9fe0e7cb024fa4955e4ade6b9e29d10db797db60f199306',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source() {
  return fs.readFileSync(path.join(sourceRoot, 'utils/exportRenderer.tsx'), 'utf8')
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

async function executeProvider(contents) {
  const ts = await loadTypeScript()
  const instrumented = contents.replace(
    'function StaticKeybindingProvider(',
    'export function StaticKeybindingProvider(',
  )
  assert.notEqual(instrumented, contents, 'static provider export hook')
  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const Provider = Symbol('KeybindingProvider')
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: {
          ...(props ?? {}),
          children: children.length === 1 ? children[0] : children,
        },
      }
    },
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'react') {
        return {
          __esModule: true,
          default: React,
          useRef: current => ({ current }),
        }
      }
      if (id === 'strip-ansi') {
        return { __esModule: true, default: value => value }
      }
      if (id.endsWith('/Messages.js')) return { Messages: Symbol('Messages') }
      if (id.endsWith('/KeybindingContext.js')) {
        return { KeybindingProvider: Provider }
      }
      if (id.endsWith('/loadUserBindings.js')) {
        return { loadKeybindingsSyncWithWarnings: () => ({ bindings: ['binding'] }) }
      }
      if (id.endsWith('/AppState.js')) {
        return { AppStateProvider: Symbol('AppStateProvider') }
      }
      if (id.endsWith('/staticRender.js')) {
        return { renderToAnsiString: () => '' }
      }
      return {}
    },
    module.exports,
    module,
  )
  return { provider: module.exports.StaticKeybindingProvider, Provider }
}

test(
  'target116 authenticates the static keybinding pre-dispatch registry',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
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
    const [baselineStart, baselineEnd, baselineHash] = units.get(17306)
    const [targetStart, targetEnd, targetHash] = units.get(17458)
    const baselineUnit = baseline.slice(baselineStart, baselineEnd)
    const targetUnit = target.slice(targetStart, targetEnd)
    assert.equal(sha256(baselineUnit), baselineHash)
    assert.equal(sha256(targetUnit), targetHash)
    assert.equal(
      structural.unmatchedBaseline.some(
        unit => unit.index === 17306 && unit.sourceHash === baselineHash,
      ),
      true,
    )
    assert.deepEqual(
      [
        structural.regions[17458].classification,
        structural.regions[17458].target.start,
        structural.regions[17458].target.end,
        structural.regions[17458].target.sourceHash,
      ],
      ['unresolved', targetStart, targetEnd, targetHash],
    )
    assert.equal(baselineUnit.includes('preDispatchRef'), false)
    assert.equal(targetUnit.split('new Set').length - 1, 2)
    assert.equal(targetUnit.split('preDispatchRef').length - 1, 1)
  },
)

test(
  'static export rendering supplies an isolated pre-dispatch handler registry',
  sourceOptions,
  async () => {
    const contents = source()
    assert.match(
      contents,
      /const preDispatchRef = useRef\(new Set\(\)\)/,
    )
    assert.match(contents, /preDispatchRef=\{preDispatchRef\}/)
    const { provider, Provider } = await executeProvider(contents)
    const child = { id: 'child' }
    const element = provider({ children: child })
    assert.equal(element.type, Provider)
    assert.deepEqual(element.props.bindings, ['binding'])
    assert.equal(element.props.children, child)
    assert.ok(element.props.preDispatchRef.current instanceof Set)
    assert.equal(element.props.preDispatchRef.current.size, 0)
    assert.ok(element.props.activeContexts instanceof Set)
    assert.notEqual(
      element.props.preDispatchRef.current,
      element.props.activeContexts,
    )
    assert.ok(element.props.handlerRegistryRef.current instanceof Map)
  },
)
