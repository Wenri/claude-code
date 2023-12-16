import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const specs = [
  ['CLAUDE_CODE_2_1_120_BUNDLE', 13_784_743, 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'],
  ['CLAUDE_CODE_2_1_121_BUNDLE', 13_908_188, '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'],
]

function bundle([env, bytes, sha]) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha)
  return value.toString('utf8')
}

test('2.1.121 adds bounded local usage attribution', () => {
  const [baseline, target] = specs.map(bundle)
  for (const fragment of [
    '"attributionAgent":"',
    '"attributionSkill":"',
    '"attributionPlugin":"',
    'Skills, subagents, and plugins',
    'No attribution data yet',
    'Heavy skills can be scoped down',
    'came from subagents under',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.split(fragment).length - 1, 1, fragment)
  }
})

test('source scans byte lines in bounded batches and accumulates all attribution dimensions', () => {
  const usage = fs.readFileSync(
    path.join(repo, 'src/components/Settings/UsageContributors.tsx'),
    'utf8',
  )
  const operations = fs.readFileSync(
    path.join(repo, 'src/utils/fsOperations.ts'),
    'utf8',
  )

  assert.match(usage, /const FILE_BATCH_SIZE = 4/)
  assert.match(usage, /for await \(const line of readLineBuffers\(file\)\)/)
  assert.match(operations, /chunkSize = 64 \* 1024/)
  assert.match(operations, /Buffer\.concat\([\s\S]*?fragmentBytes \+ newline - start/)
  assert.match(usage, /const seen = new Set<string>\(\)/)
  assert.match(usage, /addRecord\(week, record\)[\s\S]*?record\.ts >= dayStart[\s\S]*?addRecord\(day, record\)/)
  assert.match(usage, /record\.attributionSkill \?\? record\.attributionAgent/)
  assert.match(usage, /addAttribution\(accumulator\.byPlugin, record\.attributionPlugin, cost\)/)
  assert.match(usage, /agents: summarizeAttribution\(accumulator\.byAgent/)
  assert.match(usage, /skills: summarizeAttribution\(accumulator\.bySkill/)
  assert.match(usage, /plugins: summarizeAttribution\(accumulator\.byPlugin/)
  assert.match(usage, /\.filter\(value => value\.pct > 0\)/)
  assert.equal(usage.includes('getSubscriptionType'), false)
  assert.equal(usage.includes("readFile(file, 'utf8')"), false)
})

test('source renders attribution insights and bounded tables', () => {
  const usage = fs.readFileSync(
    path.join(repo, 'src/components/Settings/UsageContributors.tsx'),
    'utf8',
  )
  for (const fragment of [
    'Skills, subagents, and plugins',
    'No attribution data yet · accumulates as you use Claude',
    'Heavy skills can be scoped down or run with a cheaper model via skill frontmatter.',
    'Review what this plugin contributes — its agents, skills, and MCP tools all count toward your limit.',
    'title="Skills"',
    'title="Subagents"',
    'title="Plugins"',
    'rows.slice(0, 8)',
    'width={28}',
    'width={6}',
  ]) {
    assert.ok(usage.includes(fragment), fragment)
  }
})
