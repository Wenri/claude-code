import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
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

const units = new Map([
  [17367, [12295208, 12305146, 'cd66caae374a02f48d00d6cd0d13351671b0037a07ec010060582f8dbc0c99dd']],
  [17369, [12309356, 12314450, '6da58218e63e0b27da451abb8fdea16f70c7df054654a9f8104104d9309d8df5']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(contents, value) {
  return contents.split(value).length - 1
}

test(
  'target105 pins focused elicitation keyboard routing and the extracted field renderer',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(occurrenceCount(target, ' more above'), occurrenceCount(baseline, ' more above') + 1)
    assert.equal(occurrenceCount(target, ' more below'), occurrenceCount(baseline, ' more below') + 1)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }

    const form = target.slice(12295208, 12305146)
    assert.equal(occurrenceCount(form, 'preventDefault'), 25)
    for (const fragment of [
      'setRawMode',
      'tabIndex',
      'autoFocus',
      'onKeyDown',
      'backspace',
      'space',
    ]) {
      assert.ok(form.includes(fragment), fragment)
    }
    const fields = target.slice(12309356, 12314450)
    for (const fragment of [' more above', ' more below', 'not set']) {
      assert.ok(fields.includes(fragment), fragment)
    }
  },
)

test(
  'authored elicitation form routes only handled focused keys and retains scroll/status rendering',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'components/mcp/ElicitationDialog.tsx'),
      'utf8',
    )
    const start = owner.indexOf('function ElicitationFormDialog')
    const end = owner.indexOf('function ElicitationURLDialog', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const form = owner.slice(start, end)
    for (const fragment of [
      'const { setRawMode } = useStdin()',
      'setRawMode(true)',
      'return () => setRawMode(false)',
      'const handleFormKeyDown = (event: KeyboardEvent)',
      "event.key.length === 1 && event.key !== ' ' && !event.ctrl && !event.meta",
      'tabIndex={0} autoFocus onKeyDown={handleFormKeyDown}',
      'renderFormFields()',
      'more above',
      'not set',
    ]) {
      assert.ok(form.includes(fragment), fragment)
    }
    assert.match(form, /more\s+below/)
    assert.equal(form.includes('useInput('), false)
    assert.equal(occurrenceCount(form, 'event.preventDefault()'), 25)
    assert.equal(
      /const handleFormKeyDown[\s\S]{0,900}event\.preventDefault\(\);\s*\/\/ Expanded multi-select/.test(form),
      false,
      'the handler must not blanket-suppress unhandled keys',
    )
  },
)

test(
  'target116 retains the focused elicitation form lifecycle',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    const at = latest.indexOf('Claude Code needs your input","elicitation_dialog')
    assert.notEqual(at, -1)
    const start = latest.lastIndexOf('function ', at)
    const end = latest.indexOf('elicitation_url_dialog', at)
    const graph = latest.slice(start, end)
    assert.ok(occurrenceCount(graph, 'preventDefault') >= 25)
    for (const fragment of ['setRawMode', 'tabIndex', 'autoFocus', 'onKeyDown']) {
      assert.ok(graph.includes(fragment), fragment)
    }
  },
)
