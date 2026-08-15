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
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const unit = [
  18726,
  13304055,
  13306964,
  '8d1df18403f2e80d2fc59e598dabd055ac6b43800fa1311aa25c9b3c7acc7c31',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target101 pins tracked RemoteIO writes and refreshable auth headers', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
      : false,
}, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const [index, start, end, hash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, hash],
  )
  const target = targetBytes.toString('utf8')
  const fragment = target.slice(start, end)
  assert.equal(sha256(fragment), hash)
  assert.equal((baseline.match(/trackWrite/g) ?? []).length, 8)
  assert.equal((target.match(/trackWrite/g) ?? []).length, 11)
  assert.match(fragment, /Authorization=`Bearer \$\{/)
  assert.equal((fragment.match(/Authorization=/g) ?? []).length, 2)
  assert.match(fragment, /trackWrite\([^)]*\)/)
  assert.match(fragment, /await this\.[^.]+\.write/)
})

test('source exposes tracking to RemoteIO and invokes it before transport write', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const structured = fs.readFileSync(
    path.join(sourceRoot, 'cli/structuredIO.ts'),
    'utf8',
  )
  const remote = fs.readFileSync(path.join(sourceRoot, 'cli/remoteIO.ts'), 'utf8')
  assert.match(
    structured,
    /protected trackWrite\(message: StdoutMessage\): void/,
  )
  const methodStart = remote.indexOf('async write(message: StdoutMessage)')
  assert.ok(methodStart > 0)
  const method = remote.slice(methodStart, methodStart + 1000)
  const tracked = method.indexOf('this.trackWrite(message)')
  const ccrWrite = method.indexOf('this.ccrClient.writeEvent(message)')
  const transportWrite = method.indexOf('this.transport.write(message)')
  assert.ok(tracked > 0)
  assert.ok(ccrWrite > tracked)
  assert.ok(transportWrite > tracked)
  assert.match(remote, /headers\['Authorization'\] = `Bearer \$\{sessionToken\}`/)
  assert.match(remote, /h\['Authorization'\] = `Bearer \$\{freshToken\}`/)
})

test('target116 retains RemoteIO write tracking', {
  skip: semanticCase || !latestPath
    ? 'current target116 evidence unavailable'
    : false,
}, () => {
  const latest = fs.readFileSync(latestPath)
  assert.equal(
    sha256(latest),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const text = latest.toString('utf8')
  assert.equal((text.match(/trackWrite/g) ?? []).length, 11)
  const marker = text.indexOf('[remote-io] No session ingress token available')
  const fragment = text.slice(marker - 800, marker + 5000)
  assert.match(fragment, /trackWrite\([^)]*\)/)
})
