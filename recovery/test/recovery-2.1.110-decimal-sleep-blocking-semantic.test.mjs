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

const identities = new Map([
  [12834, [9560352, 9560689, 'FunctionDeclaration', '9ff3b41ca4d28414f5a8fdd7e600e68d29834dbe1a5df5cdc0129fe037f47dfd']],
  [13484, [9877541, 9877821, 'FunctionDeclaration', '087e02441434ac8aa2d49a4843e5fa1931523bac6efeff7e6e7885de101d729e']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function read(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function sourcePattern(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, marker)
  const match = contents
    .slice(start, start + 1600)
    .match(/const m = (\/.+\/[a-z]*)\.exec\(first\);/)
  assert.ok(match, `${marker}: regular expression`)
  return Function(`return ${match[1]}`)()
}

test(
  'target110 pins decimal Bash and PowerShell sleep classifiers',
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
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: identity`,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash, `${index}: bytes`)
      units.set(index, unit)
    }

    assert.doesNotMatch(baseline, /\\d\+\(\?:\\\.\\d\*\)\?[^\n]{0,80}parseFloat/)
    assert.match(units.get(12834), /start-sleep\|sleep/)
    assert.match(units.get(12834), /\\d\+\(\?:\\\.\\d\*\)\?/)
    assert.match(units.get(12834), /parseFloat/)
    assert.match(units.get(13484), /\^sleep\\s\+/)
    assert.match(units.get(13484), /\\d\+\(\?:\\\.\\d\*\)\?/)
    assert.match(units.get(13484), /parseFloat/)
    assert.match(units.get(12834), /z<fU8/)
    assert.match(units.get(13484), /Y<fU8/)
  },
)

test(
  'source preserves decimal syntax, threshold, remainder, and reachable denials',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const bash = read('tools/BashTool/BashTool.tsx')
    const powershell = read('tools/PowerShellTool/PowerShellTool.tsx')
    const bashPattern = sourcePattern(bash, 'detectBlockedSleepPattern')
    const powershellPattern = sourcePattern(
      powershell,
      'detectBlockedSleepPattern',
    )

    for (const [pattern, accepted, rejected] of [
      [
        bashPattern,
        ['sleep 2', 'sleep 2.5', 'sleep 2.'],
        ['sleep .5', 'sleep 2ms', 'sleep 2 3'],
      ],
      [
        powershellPattern,
        ['Start-Sleep 2', 'sleep 2.5', 'START-SLEEP -Seconds 2.'],
        ['Start-Sleep .5', 'Start-Sleep -Milliseconds 2'],
      ],
    ]) {
      for (const value of accepted) assert.ok(pattern.test(value), value)
      for (const value of rejected) assert.equal(pattern.test(value), false, value)
    }

    for (const owner of [bash, powershell]) {
      assert.ok(owner.includes('const secs = parseFloat(m[1]!)'))
      assert.ok(owner.includes('if (secs < 2) return null'))
      assert.ok(owner.includes('detectBlockedSleepPattern(input.command)'))
      assert.ok(owner.includes('if (sleepPattern !== null)'))
      assert.ok(owner.includes('errorCode: 10'))
    }
    assert.ok(bash.includes('parts.slice(1).join'))
    assert.ok(powershell.includes("replace(/^[\\s;|&]+/, '')"))
  },
)
