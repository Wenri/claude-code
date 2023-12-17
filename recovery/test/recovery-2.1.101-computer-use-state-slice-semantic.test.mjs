import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [7352, [5316049, 5316715, '47233c8e5714e93358b0200f842a1eba0285c22dc06d16a70452ce8d48add11d']],
  [8814, [6921610, 6924434, '9bda9aa2696329af15f23743cf42364a8b939a68db1756a2673b283f99382db9']],
  [12611, [9684288, 9686387, 'a2b1ee5f3c913983074edf6558ced265a2a932aae3966f315f03353aaf6436c3']],
  [18222, [12660551, 12718728, '74b589580c0b21c4bb029a90a90e1767aea485121eee0a52d5b87ff4fa074cdd']],
])

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target101 pins the computer-use state-slice call graph', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
  assert.equal(sha256(targetBytes), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('setComputerUseMcpState'), false)
  assert.ok(target.includes('setComputerUseMcpState'))
  for (const [index, [start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
})

test('target101 isolates computer-use mutation from arbitrary AppState writes', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const cleanup = target.slice(...units.get(7352).slice(0, 2))
  const wrapper = target.slice(...units.get(8814).slice(0, 2))
  const forked = target.slice(...units.get(12611).slice(0, 2))
  const repl = target.slice(...units.get(18222).slice(0, 2))
  assert.match(cleanup, /setComputerUseMcpState\?\./)
  assert.equal((wrapper.match(/setComputerUseMcpState\?\./g) ?? []).length, 6)
  assert.ok(forked.includes('shareSetAppState'))
  assert.ok(forked.includes('setComputerUseMcpState'))
  assert.ok(repl.includes('computerUseMcpState'))
})

test('source owns the slice setter, isolation gate, wrapper writes, and cleanup', sourceOptions, () => {
  const tool = source('Tool.ts')
  assert.ok(tool.includes('setComputerUseMcpState?:'))
  assert.ok(tool.includes("AppState['computerUseMcpState']"))

  const forked = source('utils/forkedAgent.ts')
  assert.ok(forked.includes('setComputerUseMcpState: overrides?.shareSetAppState'))
  assert.ok(forked.includes('? parentContext.setComputerUseMcpState'))

  const cleanup = source('utils/computerUse/cleanup.ts')
  assert.ok(cleanup.includes("'getAppState' | 'setComputerUseMcpState' | 'sendOSNotification'"))
  assert.ok(cleanup.includes('ctx.setComputerUseMcpState?.(prev =>'))

  const wrapper = source('utils/computerUse/wrapper.tsx')
  assert.equal((wrapper.match(/setComputerUseMcpState\?\./g) ?? []).length, 6)
  assert.equal(wrapper.includes('setAppState(prev =>'), false)

  const repl = source('screens/REPL.tsx')
  assert.ok(repl.includes('setComputerUseMcpState(update)'))
  assert.ok(repl.includes('const computerUseMcpState = update(previous.computerUseMcpState)'))
  assert.ok(repl.includes('return { ...previous, computerUseMcpState }'))
})
