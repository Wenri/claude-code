import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const artifactRoot = process.env.CLAUDE_CODE_RECOVERY_ARTIFACT_ROOT
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_89_BUNDLE ??
  (artifactRoot ? path.join(artifactRoot, '2.1.89/package/cli.js') : undefined)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_90_BUNDLE ??
  (artifactRoot ? path.join(artifactRoot, '2.1.90/package/cli.js') : undefined)
const BASELINE_BUNDLE_SHA256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'
const TARGET_BUNDLE_SHA256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function collectStringLiterals(node, start, end, result = []) {
  if (!node || typeof node !== 'object') return result
  if (
    node.start >= start &&
    node.end <= end &&
    node.type === 'Literal' &&
    typeof node.value === 'string'
  ) {
    result.push(node.value)
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const child of value) collectStringLiterals(child, start, end, result)
    } else {
      collectStringLiterals(value, start, end, result)
    }
  }
  return result
}

function powerupRegion(bundle) {
  const start = bundle.indexOf('"at-mentions"')
  assert.notEqual(start, -1, 'target lacks first power-up lesson')
  const description =
    'Discover Claude Code features through quick interactive lessons'
  const descriptionStart = bundle.indexOf(description, start)
  assert.notEqual(descriptionStart, -1, 'target lacks /powerup command')
  return { start, end: descriptionStart + description.length + 1 }
}

test('all published /powerup lesson and UI literals have source owners', { timeout: 30_000 }, () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('tengu_powerup_lesson_opened'), false)
  assert.equal(target.includes('tengu_powerup_lesson_opened'), true)

  const source = fs.readFileSync(
    path.join(sourceRoot, 'commands/powerup/powerup.tsx'),
    'utf8',
  )
  const commandSource = fs.readFileSync(
    path.join(sourceRoot, 'commands/powerup/index.ts'),
    'utf8',
  )
  const { start, end } = powerupRegion(target)
  const targetAst = parse(target, { ecmaVersion: 'latest', sourceType: 'module' })
  const literals = [...new Set(collectStringLiterals(targetAst, start, end))]

  // These are compiler/runtime implementation strings rather than authored
  // /powerup semantics. Each exclusion is exact and deliberately closed.
  const generatedOnly = new Set([
    'react.memo_cache_sentinel',
    'confirm:no', // supplied by the shared Dialog source owner
    'pending', // StatusIndicator's internal state name
    'local-jsx', // command discriminator owned by index.ts
  ])
  const missing = literals.filter(
    literal =>
      literal.length > 0 &&
      !generatedOnly.has(literal) &&
      !source.includes(literal) &&
      !commandSource.includes(literal),
  )
  assert.deepEqual(missing, [])
  assert.equal(literals.length, 152, 'published /powerup literal set drifted')
})

test('/powerup source preserves parser, animation, live mode, persistence, telemetry, and completion branches', () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'commands/powerup/powerup.tsx'),
    'utf8',
  )
  const commands = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')
  const config = fs.readFileSync(path.join(sourceRoot, 'utils/config.ts'), 'utf8')

  assert.match(source, /const DEMO_MARKUP = \/\\\[\(\\w\+\):\(\[\^\\\]\]\*\)\\\]\/g/)
  assert.match(source, /line\.startsWith\('#'\)[\s\S]*?matchAll\(DEMO_MARKUP\)/)
  assert.match(source, /useAnimationFrame\(reducedMotion \? null : 3000/)
  assert.match(source, /prefersReducedMotion/)
  assert.match(source, /'confirm:cycleMode'[\s\S]*?POWERUP_MODES\.length/)
  assert.match(source, /Array\.from\(\{ length: 40 \}/)
  assert.match(source, /setTimeout\(onDone, 2000\)/)
  assert.match(source, /current\.has\(lessonId\)[\s\S]*?new Set\(current\)/)
  assert.match(source, /powerupsUnlocked: \[\.\.\.next\]/)
  assert.match(
    source,
    /tengu_powerup_lesson_opened[\s\S]*?was_already_unlocked[\s\S]*?unlocked_count/,
  )
  assert.match(
    source,
    /tengu_powerup_lesson_completed[\s\S]*?all_unlocked:[\s\S]*?POWERUP_LESSONS\.length/,
  )
  assert.match(source, /next\.size === POWERUP_LESSONS\.length[\s\S]*?setShowCelebration\(true\)/)
  assert.match(source, /onDone\(message, \{ display: 'system' \}\)/)
  assert.match(commands, /import powerup from '.\/commands\/powerup\/index\.js'/)
  assert.match(commands, /\n  powerup,\n/)
  assert.match(config, /powerupsUnlocked\?: string\[\]/)
  assert.match(config, /'powerupsUnlocked'/)
})

test('/powerup source owns exactly the ten published stable lesson IDs', () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'commands/powerup/powerup.tsx'),
    'utf8',
  )
  const ids = [...source.matchAll(/^\s+id: '([^']+)',$/gm)].map(match => match[1])
  assert.deepEqual(ids, [
    'at-mentions',
    'modes',
    'undo',
    'background',
    'memory',
    'mcp',
    'automate',
    'subagents',
    'cross-device',
    'model-dial',
  ])
})
