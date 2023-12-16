import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
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

const baselineUnit = {
  index: 20_433,
  start: 12_922_967,
  end: 12_979_572,
  hash: '5f3e1791357601d74dabfd793956c8df5a7489a22c9e2505ef600b53cce9e22b',
}
const targetUnit = {
  index: 20_720,
  start: 13_036_753,
  end: 13_094_202,
  hash: '5eedcab727da9a4eb48d70598545dc8c7e0d3f33546e1d64f0b186ab829a7017',
}
const remoteReason =
  'Remote Control is not available inside --remote sessions.'
const teleportReason =
  '--teleport sessions start without Remote Control. Use /remote-control to enable it.'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source() {
  return fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8')
}

function extractGate(contents) {
  const start = contents.indexOf(
    "if (feature('BRIDGE_MODE') && remoteControlOption !== undefined)",
  )
  assert.notEqual(start, -1, 'remote-control startup gate')
  const end = contents.indexOf(
    '// Check for pending agent memory snapshot updates',
    start,
  )
  assert.notEqual(end, -1, 'remote-control startup gate end')
  return contents.slice(start, end)
}

async function executeGate(gate, {
  remote = null,
  teleport = null,
  entitlementReason = null,
} = {}) {
  const writes = []
  const imports = []
  let marked = 0
  const executableGate = gate
    .replace('let disabledReason: string | null;', 'let disabledReason;')
    .replace(
      "await import('./bridge/bridgeEnabled.js')",
      'await loadBridge()',
    )
  const run = new Function(
    'feature',
    'remoteControlOption',
    'remote',
    'teleport',
    'loadBridge',
    'process',
    'chalk',
    'markRemoteControlUsed',
    `return (async () => {
      let remoteControl = false
      ${executableGate}
      return remoteControl
    })()`,
  )
  const enabled = await run(
    () => true,
    true,
    remote,
    teleport,
    async () => {
      imports.push('bridge')
      return { getBridgeDisabledReason: async () => entitlementReason }
    },
    { stderr: { write: value => writes.push(value) } },
    { yellow: value => value },
    () => {
      marked++
    },
  )
  return { enabled, imports, marked, writes }
}

test(
  'authenticated 114→116 adds remote and teleport suppression to the startup gate',
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
    const baselineSlice = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetSlice = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineSlice), baselineUnit.hash)
    assert.equal(sha256(targetSlice), targetUnit.hash)

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
    assert.equal(
      structural.unmatchedBaseline.some(
        unit =>
          unit.index === baselineUnit.index &&
          unit.start === baselineUnit.start &&
          unit.end === baselineUnit.end &&
          unit.sourceHash === baselineUnit.hash,
      ),
      true,
    )
    assert.deepEqual(
      [
        structural.regions[targetUnit.index].classification,
        structural.regions[targetUnit.index].target.start,
        structural.regions[targetUnit.index].target.end,
        structural.regions[targetUnit.index].target.sourceHash,
      ],
      ['unresolved', targetUnit.start, targetUnit.end, targetUnit.hash],
    )
    assert.equal(occurrences(baselineSlice, remoteReason), 0)
    assert.equal(occurrences(baselineSlice, teleportReason), 0)
    assert.equal(occurrences(targetSlice, remoteReason), 1)
    assert.equal(occurrences(targetSlice, teleportReason), 1)
    for (const slice of [baselineSlice, targetSlice]) {
      assert.equal(occurrences(slice, '--rc flag ignored.'), 1)
    }
  },
)

test(
  'remote-control startup suppresses nested session modes before entitlement lookup',
  sourceOptions,
  async () => {
    const contents = source()
    const gate = extractGate(contents)
    assert.ok(gate.indexOf('if (remote !== null)') < gate.indexOf('else if (teleport)'))
    assert.ok(gate.indexOf('else if (teleport)') < gate.indexOf('getBridgeDisabledReason'))
    assert.match(gate, new RegExp(remoteReason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(gate, new RegExp(teleportReason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    const remote = await executeGate(gate, { remote: '' })
    assert.equal(remote.enabled, false)
    assert.deepEqual(remote.imports, [])
    assert.equal(remote.marked, 0)
    assert.deepEqual(remote.writes, [`${remoteReason}\n--rc flag ignored.\n`])

    const teleport = await executeGate(gate, { teleport: 'session-1' })
    assert.equal(teleport.enabled, false)
    assert.deepEqual(teleport.imports, [])
    assert.equal(teleport.marked, 0)
    assert.deepEqual(teleport.writes, [`${teleportReason}\n--rc flag ignored.\n`])

    const denied = await executeGate(gate, {
      entitlementReason: 'not entitled',
    })
    assert.equal(denied.enabled, false)
    assert.deepEqual(denied.imports, ['bridge'])
    assert.equal(denied.marked, 0)
    assert.deepEqual(denied.writes, ['not entitled\n--rc flag ignored.\n'])

    const allowed = await executeGate(gate)
    assert.equal(allowed.enabled, true)
    assert.deepEqual(allowed.imports, ['bridge'])
    assert.equal(allowed.marked, 1)
    assert.deepEqual(allowed.writes, [])
  },
)
