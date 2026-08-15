import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated target110 and target111 bundles are required'
      : false,
}

const units = new Map([
  [11270, ['FunctionDeclaration', 8540432, 8540628, 'f06a00b7f0b447c90d44ab0ff54d3bfcd8dcd62858b19ffe67d88677ad1bc1e2']],
  [11325, ['FunctionDeclaration', 8550316, 8553457, '9a157b68165a125fa5b04ca884964c32aabf44a2fd592b9db794c60673817231']],
  [11326, ['FunctionDeclaration', 8553457, 8556641, 'fd5a2c45a676423b60b0a0d3fee04ce4c77e0e162b02233cd06fcc8c01565ad5']],
  [11341, ['VariableDeclaration', 8561302, 8567698, '9b0c22d7070f964a6b5e322ea677980c1cb57fefac2e7bf4cd2ea3ee25a29ee4']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

// Executable specification of the exact target helper. The source assertions
// below bind every branch in this implementation to the authored owner.
function distance(left, right) {
  if (left === right) return 0
  const matrix = Array.from({ length: left.length + 1 }, (_, leftIndex) =>
    Array.from({ length: right.length + 1 }, (_, rightIndex) =>
      leftIndex === 0 ? rightIndex : rightIndex === 0 ? leftIndex : 0,
    ),
  )
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      matrix[leftIndex][rightIndex] = Math.min(
        matrix[leftIndex - 1][rightIndex] + 1,
        matrix[leftIndex][rightIndex - 1] + 1,
        matrix[leftIndex - 1][rightIndex - 1] + substitution,
      )
      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        matrix[leftIndex][rightIndex] = Math.min(
          matrix[leftIndex][rightIndex],
          matrix[leftIndex - 2][rightIndex - 2] + 1,
        )
      }
    }
  }
  return matrix[left.length][right.length]
}

function closest(input, commands, maxEditDistance = 1) {
  const names = commands.flatMap(command => [
    command.name,
    ...(command.aliases ?? []),
  ])
  let best
  let bestDistance = maxEditDistance + 1
  for (const name of names) {
    if (Math.abs(name.length - input.length) > maxEditDistance) continue
    const candidateDistance = distance(input, name)
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance
      best = name
    }
  }
  return best
}

test('target111 pins command distance, noninteractive guards, and Skill schema', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
  assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const slices = new Map()

  for (const [index, [nodeType, start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
      [nodeType, start, end, sourceHash],
      `${index}: structural identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), sourceHash, `${index}: target bytes`)
    slices.set(index, unit)
  }

  for (const fragment of [
    'maxEditDistance',
    "isn't available in this environment.",
    "opens an interactive panel and isn't available in this environment",
    'The name of a skill from the available-skills list. Do not guess names.',
  ]) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.ok(occurrences(target, fragment) > 0, `target: ${fragment}`)
  }
  assert.equal(occurrences(target, 'maxEditDistance'), 3)
  assert.match(slices.get(11270), /maxEditDistance:[^,}]*=1.*flatMap.*aliases.*Math\.abs.*EKY/s)
  assert.match(slices.get(11325), /isNonInteractiveSession.*isn't available in this environment.*had_suggestion:!1.*maxEditDistance:2/s)
  assert.match(slices.get(11326), /type==="local-jsx".*isNonInteractiveSession.*opens an interactive panel.*Claude Code terminal/s)
  assert.match(slices.get(11341), /Do not guess names\..*maxEditDistance:2/s)
})

test('source owns the exact bounded Damerau distance and both noninteractive paths', sourceOptions, () => {
  const suggestions = source('utils/suggestions/commandSuggestions.ts')
  const processInput = source('utils/processUserInput/processSlashCommand.tsx')
  const skillTool = source('tools/SkillTool/SkillTool.ts')

  for (const fragment of [
    '{ maxEditDistance = 1 }',
    'commands.flatMap(command => [',
    '...(command.aliases ?? [])',
    'Math.abs(name.length - input.length) > maxEditDistance',
    'matrix[leftIndex - 2]![rightIndex - 2]! + 1',
  ]) {
    assert.ok(suggestions.includes(fragment), `commandSuggestions.ts: ${fragment}`)
  }
  assert.equal((processInput.match(/\{ maxEditDistance: 2 \}/g) ?? []).length, 1)
  assert.match(
    processInput,
    /isNonInteractiveSession[\s\S]*builtInCommandNames\(\)\.has\(commandName\)[\s\S]*isn't available in this environment\.[\s\S]*had_suggestion: false/,
  )
  assert.match(
    processInput,
    /command\.type === 'local-jsx' && context\.options\.isNonInteractiveSession[\s\S]*opens an interactive panel and isn't available in this environment\.[\s\S]*Claude Code terminal instead/,
  )
  assert.ok(skillTool.includes('The name of a skill from the available-skills list. Do not guess names.'))
  assert.equal((skillTool.match(/\{ maxEditDistance: 2 \}/g) ?? []).length, 1)

  const commands = [
    { name: 'doctor', aliases: ['health-check'] },
    { name: 'compact' },
  ]
  assert.equal(closest('doctor', commands), 'doctor')
  assert.equal(closest('doctro', commands), 'doctor', 'adjacent transposition')
  assert.equal(closest('health-chekc', commands), 'health-check', 'alias transposition')
  assert.equal(closest('compcat', commands, 2), 'compact')
  assert.equal(closest('do', commands, 2), undefined, 'length pruning')
  assert.equal(closest('unrelated', commands, 2), undefined)
})
