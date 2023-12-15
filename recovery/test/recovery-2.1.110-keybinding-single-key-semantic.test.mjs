import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
    5956,
    [
      4224690,
      4229252,
      'VariableDeclaration',
      'b371d252cafe18e333e43ab3f3ef4bb1c012cb8729fe90337941d480a152f420',
    ],
  ],
  [
    9470,
    [
      6970565,
      6971074,
      'FunctionDeclaration',
      'd595d66f9ecb460981a773ed61ef23145c5c5784c9c227a89806853a6b9608cd',
    ],
  ],
  [
    9472,
    [
      6971082,
      6971349,
      'VariableDeclaration',
      'd218140376b0ba0e0daad5e9deb7efa53d2ee6eac9e02cd3a4601cd682f22112',
    ],
  ],
  [
    9477,
    [
      6973316,
      6975219,
      'FunctionDeclaration',
      '0a8b7220be7daff52abf13e4afa657e4db863d5360a1999016dc5f2b52e26e08',
    ],
  ],
])

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins the single-key registry and the static DOM adapter residue',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const slices = new Map()
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
      const unit = target.slice(start, end)
      assert.equal(sha256(unit), hash, `${index}: bytes`)
      slices.set(index, unit)
    }

    assert.equal(baseline.includes('singleKey'), false)
    assert.equal(target.match(/singleKey/g)?.length, 3)
    assert.equal(baseline.includes('plugin:favorite'), false)
    assert.match(slices.get(5956), /"plugin:favorite"/)
    const interceptor = slices.get(9477)
    assert.match(interceptor, /\.singleKey/)
    assert.match(interceptor, /\.handler\(\)!==!1/)
    assert.match(interceptor, /\.type==="match"\?[^:]+\.action:null/)

    // The compiled DOM adapter is allocated into a local closure that is then
    // assigned to a one-use local and never registered, returned, or invoked.
    // Its key-name table is reachable only from that same unescaped closure.
    const adapter = slices.get(9470)
    const adapterName = adapter.match(/^function ([\w$]+)\(/)?.[1]
    assert.ok(adapterName)
    assert.match(adapter, /superKey/)
    assert.match(adapter, /meta:[^,]+\.meta\|\|[^=]+==="escape"/)
    assert.match(adapter, /\.key==="enter"\?/)
    const escapedAdapter = adapterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.equal(target.match(new RegExp(`\\b${escapedAdapter}\\b`, 'g'))?.length, 2)
    const adapterCall = new RegExp(
      `([\\w$]+)=\\([^)]*\\)=>\\{let\\{input:[\\w$]+,key:[\\w$]+\\}=${escapedAdapter}\\([^)]*\\);`,
    ).exec(interceptor)
    assert.ok(adapterCall, 'adapter is captured by a local closure')
    const closureTemp = adapterCall[1]
    const sinkMatch = new RegExp(`let ([\\w$]+)=${closureTemp},`).exec(
      interceptor.slice(adapterCall.index + adapterCall[0].length),
    )
    assert.ok(sinkMatch, 'adapter closure is assigned to its dead sink')
    const sink = sinkMatch[1]
    const escapedSink = sink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.equal(
      interceptor.match(new RegExp(`\\b${escapedSink}\\b`, 'g'))?.length,
      1,
      'adapter closure sink is never read',
    )

    // React's compiled cache also allocates a wheel-event adapter.  The local
    // receiving that callback is likewise never registered with the rendered
    // provider (the live provider receives the Ink input handler instead), so
    // its deltaY property reads are unreachable target residue rather than a
    // missing authored DOM event path.
    const wheelAdapter = interceptor.match(
      /([\w$]+)=\(k\)=>\{let E=\{upArrow:!1,[^}]*wheelUp:k\.deltaY<0,wheelDown:k\.deltaY>0,[^}]*\};j\("",E,\(\)=>[^,]+,!0\)\}/,
    )
    assert.ok(wheelAdapter, 'compiled wheel adapter')
    const wheelClosure = wheelAdapter[1]
    const wheelSinkMatch = new RegExp(`let ([\\w$]+)=${wheelClosure},`).exec(
      interceptor.slice(wheelAdapter.index + wheelAdapter[0].length),
    )
    assert.ok(wheelSinkMatch, 'wheel adapter is assigned to its dead sink')
    const wheelSink = wheelSinkMatch[1]
    const escapedWheelSink = wheelSink.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )
    assert.equal(
      interceptor.match(new RegExp(`\\b${escapedWheelSink}\\b`, 'g'))?.length,
      1,
      'wheel adapter sink is never read',
    )
    assert.match(slices.get(9472), /wheelup:"wheelUp"/)
    assert.match(slices.get(9472), /escape:"escape"/)
  },
)

test(
  'source owns the reachable single-key dispatch and latest telemetry graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const setup = fs.readFileSync(
      path.join(sourceRoot, 'keybindings/KeybindingProviderSetup.tsx'),
      'utf8',
    )
    const context = fs.readFileSync(
      path.join(sourceRoot, 'keybindings/KeybindingContext.tsx'),
      'utf8',
    )
    const hook = fs.readFileSync(
      path.join(sourceRoot, 'keybindings/useKeybinding.ts'),
      'utf8',
    )
    const schema = fs.readFileSync(
      path.join(sourceRoot, 'keybindings/schema.ts'),
      'utf8',
    )
    const defaults = fs.readFileSync(
      path.join(sourceRoot, 'keybindings/defaultBindings.ts'),
      'utf8',
    )
    for (const fragment of [
      'singleKey?: boolean',
      'if (!registration.singleKey) continue',
      "resolved.type === 'match' ? resolved.action : null",
      'registration.handler() !== false',
    ]) {
      assert.ok(setup.includes(fragment), fragment)
    }
    assert.equal((hook.match(/singleKey: true/g) ?? []).length, 2)
    assert.ok(context.includes('singleKey?: boolean'))
    assert.ok(schema.includes("'plugin:favorite'"))
    assert.ok(defaults.includes("f: 'plugin:favorite'"))

    if (semanticCase === caseName) {
      assert.equal(setup.includes('preDispatchRef'), false)
      assert.equal(setup.includes('recordKeybindingFired'), false)
      assert.equal(context.includes('registerPreDispatch'), false)
      assert.equal(hook.includes('recordKeybindingFired'), false)
      return
    }

    const telemetry = fs.readFileSync(
      path.join(sourceRoot, 'keybindings/telemetry.ts'),
      'utf8',
    )
    assert.ok(setup.includes('preDispatchRef'))
    assert.ok(setup.includes('recordKeybindingFired'))
    assert.ok(context.includes('registerPreDispatch'))
    assert.ok(hook.includes('useKeybindingPreDispatch'))
    assert.ok(hook.includes('recordKeybindingFired(result.action)'))
    assert.ok(telemetry.includes("action.startsWith('command:')"))
    assert.ok(telemetry.includes("'command:custom'"))
    assert.ok(telemetry.includes('KEYBINDING_TELEMETRY_DEBOUNCE_MS = 1000'))
    assert.ok(telemetry.includes("logEvent('tengu_keybinding_fired'"))
  },
)
