import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const LATEST_SHA256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const targetUnits = [
  [10038, 5036535, 5036730, '770a6951343cdab9e9bffb33636a118e72c1be4c3f0d23f51eec33a8cf575eb0'],
  [10041, 5037647, 5037766, '5820d3599bb5f8feabc8d6cb7b9ccafe9ebca1a8d9a7df62b53be49398cdd994'],
  [10042, 5037766, 5037829, 'd2192fc8acf4a6fdc00e609d357169aef578ad036b2e40fc87e8aaee9682e4f7'],
  [10047, 5040818, 5041488, 'eb7c79c2ea716b63c06f7bee86fc00b4bb57a1b7cb07b8fd3087a1f23343bc9c'],
  [10051, 5042937, 5043316, 'e1cbd9c062d128d66e34042cfbefc9426825cea2c14949f9b0d205bf99424149'],
  [10052, 5043316, 5043846, '2e2fce816b1e96ebd6d01c50097161f7a3d0954b14cdde065b2c38e39269f8b8'],
  [13465, 8540338, 8554411, 'f7cdef9264472711e47ebce95c56e1e2e878b91519aba457e024e86454720d23'],
  [19240, 11809381, 11811371, 'f999c54e846aa128d2ff51d4f4fa5d36964821da76f23da602236cba5e2d34ee'],
  [20295, 12806766, 12842260, 'b1da0be6cca106461e6a01b1d96682b6a0b2bb33edcd869650319e1216252fa7'],
]

const matchedBaselineUnits = [
  [10038, 8864, 5905003, 5905198, '8f7242372cc2c4602c880dc7c244fc42edff9c9fc95c5d359dd1d9d23e5982ef'],
  [10041, 8867, 5906115, 5906234, '34db2101ca012f51e467f4ca7a63dcb65a923f657024d5d6f231b9fb0e6bef61'],
  [10042, 8868, 5906234, 5906297, 'e87d2af353c7c34bffe8a91835c994f57a71e448e8a6e26099b3b57156e65e26'],
  [10047, 8872, 5908886, 5909556, '3793ef1b796f804087a9911862ce8caa241bb35cb3b58e01ac089e9d921f03cc'],
  [10052, 8877, 5911471, 5912001, 'cf87d094b60e7ebbb14da50c1f06935d0b3f76016704b3c844782a573095f5ec'],
]

const baselineToolExecutionEnd = [
  8876,
  5911005,
  5911471,
  'ceaf4c2327e9bd966c060e0660aced0c030b081538abb66d0987b3176393a58a',
]

const latestUnits = [
  [10147, 5073602, 5073797, '0bb598f603d0b21f927ea31529484f837f57350e22ed3bbf1035460506bd1f24'],
  [10150, 5074714, 5074833, 'b6ca8541167436da23f2f3db68223e034a55f4673c9373e0b791b7b8b611c87f'],
  [10151, 5074833, 5074896, 'ca59fe26bf5b1d893c95c62a7d0cfc6f9d6671db0cc42f51eacc1b6f4a1a7787'],
  [10156, 5077885, 5078555, '80138513cf0e7db568f184e4fbf207b856cef45ab51d4c9a03de400fe8e547e8'],
  [10160, 5080004, 5080383, '890621c1530337ffb74608f8cb98858f3880b7da418db8f74666090e5b606928'],
  [10161, 5080383, 5080913, '2b1ec707195e8e31a62a8c4ed6ddaf00f1212e658fc1ffdd8d5143da3444ccb7'],
  [13604, 8589712, 8603636, 'd1efb963531943feeab5ff1521cdfa20debc75304a810573537027233ff6fcdb'],
  [19489, 11899357, 11901347, '13601fc330008d98f74ee70dff730acb46c840b21af3fca2658d38f28f2e6f05'],
  [20581, 12915603, 12954120, '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2'],
]

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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bundle(filename, expectedHash) {
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedHash)
  return bytes.toString('utf8')
}

function source(relative) {
  const direct = path.join(sourceRoot, relative)
  const nested = path.join(sourceRoot, 'src', relative)
  return fs.readFileSync(fs.existsSync(direct) ? direct : nested, 'utf8')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function unit(target, index) {
  const expected = targetUnits.find(entry => entry[0] === index)
  assert.ok(expected, `unit ${index}`)
  return target.slice(expected[1], expected[2])
}

function compile(sourceText, dependencies, exportName) {
  return Function(
    ...Object.keys(dependencies),
    `${sourceText}; return ${exportName}`,
  )(...Object.values(dependencies))
}

function mockSpan(id) {
  return {
    id,
    attributes: [],
    endCount: 0,
    statuses: [],
    spanContext() {
      return { spanId: id }
    },
    setAttribute(name, value) {
      this.attributes.push({ [name]: value })
    },
    setAttributes(attributes) {
      this.attributes.push(attributes)
    },
    setStatus(status) {
      this.statuses.push(status)
    },
    end() {
      this.endCount += 1
    },
  }
}

test(
  'target113 authenticates the complete tracing lifecycle and exact callers',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const baseline = bundle(baselinePath, BASELINE_SHA256)
    const target = bundle(targetPath, TARGET_SHA256)

    for (const [index, start, end, sourceHash] of targetUnits) {
      const row = structural.regions.find(entry => entry.target?.index === index)
      assert.ok(row, `target unit ${index}: structural row`)
      assert.deepEqual(
        [row.target.index, row.target.start, row.target.end, row.target.sourceHash],
        [index, start, end, sourceHash],
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash)
    }

    for (const [targetIndex, index, start, end, sourceHash] of matchedBaselineUnits) {
      const row = structural.regions.find(
        entry => entry.target?.index === targetIndex,
      )
      assert.equal(row?.baselineUnitIndex, index)
      assert.equal(sha256(baseline.slice(start, end)), sourceHash)
    }

    assert.equal(
      sha256(
        baseline.slice(
          baselineToolExecutionEnd[1],
          baselineToolExecutionEnd[2],
        ),
      ),
      baselineToolExecutionEnd[3],
    )
    assert.match(
      baseline.slice(baselineToolExecutionEnd[1], baselineToolExecutionEnd[2]),
      /Array\.from\([^)]*\.values\(\)\)\.findLast/,
    )
    assert.match(unit(target, 10051), /\.getStore\(\)/)
    assert.doesNotMatch(unit(target, 10051), /Array\.from\(/)
    assert.match(unit(target, 10038), /!.*\.ended.*findLast.*!.*\.ended/s)
    assert.match(unit(target, 10041), /\.run\(.*\).*finally.*===/s)
    assert.match(unit(target, 10047), /\(\)\?\?.*\(\)/)
    assert.match(unit(target, 10052), /if\([^)]*\).*\.get\(.*\)\?\.deref\(\)/)
    assert.equal(occurrences(unit(target, 13465), 'rm$('), 3)
    assert.equal(occurrences(unit(target, 19240), 'im$('), 1)
    assert.equal(occurrences(unit(target, 20295), 'im$('), 1)
    assert.ok(occurrences(unit(target, 19240), 'FQ()') >= 2)
    assert.equal(occurrences(unit(target, 20295), 'finally{FQ()}'), 1)
  },
)

test(
  'authenticated target113 lifecycle rejects stale parents and ends exact concurrent spans',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const target = bundle(targetPath, TARGET_SHA256)

    const interactionStorage = new AsyncLocalStorage()
    const interactionSpans = new Map()
    const getInteraction = compile(
      unit(target, 10038),
      { BQ: interactionStorage, h3: interactionSpans },
      'nm$',
    )
    const endedInteraction = { ended: true, attributes: { 'span.type': 'interaction' } }
    const liveInteraction = { ended: false, attributes: { 'span.type': 'interaction' } }
    interactionSpans.set('ended', new WeakRef(endedInteraction))
    interactionSpans.set('live', new WeakRef(liveInteraction))
    await interactionStorage.run(endedInteraction, async () => {
      assert.equal(getInteraction(), liveInteraction)
    })
    interactionSpans.delete('live')
    await interactionStorage.run(endedInteraction, async () => {
      assert.equal(getInteraction(), undefined)
    })

    let startedContext
    const runInteraction = compile(
      unit(target, 10041),
      {
        BQ: interactionStorage,
        eJ9(prompt) {
          startedContext = { prompt, ended: false }
          interactionStorage.enterWith(startedContext)
        },
      },
      'im$',
    )
    const observed = []
    const interactionPromise = runInteraction('turn prompt', async () => {
      observed.push(interactionStorage.getStore())
      await new Promise(resolve => setImmediate(resolve))
      observed.push(interactionStorage.getStore())
    })
    assert.equal(interactionStorage.getStore(), undefined)
    await interactionPromise
    assert.deepEqual(observed, [startedContext, startedContext])

    const toolStorage = new AsyncLocalStorage()
    const activeTools = new Map()
    const strongTools = new Map()
    const getTool = compile(
      unit(target, 10042),
      { hx: toolStorage },
      'ATK',
    )
    const parents = []
    let nextSpanId = 0
    const startTool = compile(
      unit(target, 10047),
      {
        ATK: getTool,
        N5: {
          context: { active: () => ({}) },
          trace: {
            getActiveSpan: () => undefined,
            setSpan: (_context, span) => ({ parentSpan: span }),
          },
        },
        YR: () => true,
        ZvK: () => undefined,
        aj: span => span.id,
        chH: (type, attributes = {}) => ({
          'span.type': type,
          ...attributes,
        }),
        h3: activeTools,
        hx: toolStorage,
        mv: () => ({
          startSpan(_name, _options, context) {
            const span = mockSpan(`tool-${++nextSpanId}`)
            parents.push(context.parentSpan)
            return span
          },
        }),
        nm$: () => liveInteraction,
        qTK: () => {},
        rs: () => false,
        sj: strongTools,
      },
      'OTK',
    )
    liveInteraction.span = mockSpan('interaction')
    const outerTool = startTool('outer')
    assert.equal(parents[0], liveInteraction.span)
    const innerTool = startTool('inner')
    assert.equal(parents[1], outerTool)
    toolStorage.getStore().ended = true
    startTool('after-ended')
    assert.equal(parents[2], liveInteraction.span)
    assert.equal(getTool(), toolStorage.getStore())
    toolStorage.getStore().ended = true
    assert.equal(getTool(), undefined)
    toolStorage.enterWith(undefined)
    assert.notEqual(outerTool, innerTool)

    const executionStorage = new AsyncLocalStorage()
    const executionActive = new Map()
    const executionStrong = new Map()
    const endExecution = compile(
      unit(target, 10051),
      {
        N5: { SpanStatusCode: { ERROR: 2 } },
        Qm$: executionStorage,
        YR: () => true,
        aj: span => span.id,
        h3: executionActive,
        sj: executionStrong,
      },
      'Ki8',
    )
    const executionA = { span: mockSpan('execution-a'), startTime: Date.now() }
    const executionB = { span: mockSpan('execution-b'), startTime: Date.now() }
    for (const context of [executionA, executionB]) {
      executionActive.set(context.span.id, new WeakRef(context))
      executionStrong.set(context.span.id, context)
    }
    await Promise.all([
      executionStorage.run(executionA, async () => {
        await Promise.resolve()
        endExecution({ success: true })
        assert.equal(executionStorage.getStore(), undefined)
      }),
      executionStorage.run(executionB, async () => {
        await new Promise(resolve => setImmediate(resolve))
        endExecution({ success: false, error: 'boom' })
        assert.equal(executionStorage.getStore(), undefined)
      }),
    ])
    assert.equal(executionA.span.endCount, 1)
    assert.equal(executionB.span.endCount, 1)
    assert.deepEqual(executionB.span.statuses, [{ code: 2, message: 'boom' }])

    const exactToolStorage = new AsyncLocalStorage()
    const exactActive = new Map()
    const exactStrong = new Map()
    const endTool = compile(
      unit(target, 10052),
      {
        KTK: () => {},
        YR: () => true,
        aj: span => span.id,
        h3: exactActive,
        hx: exactToolStorage,
        sj: exactStrong,
        vvK: () => {},
      },
      'rm$',
    )
    function trackTool(id) {
      const context = {
        attributes: { 'span.type': 'tool', tool_name: id },
        ended: false,
        span: mockSpan(id),
        startTime: Date.now(),
      }
      exactActive.set(id, new WeakRef(context))
      exactStrong.set(id, context)
      return context
    }
    const toolA = trackTool('a')
    const toolB = trackTool('b')
    await exactToolStorage.run(toolA, async () => {
      endTool(toolB.span, 'result-b', 2)
      assert.equal(toolB.ended, true)
      assert.equal(toolB.span.endCount, 1)
      assert.equal(exactToolStorage.getStore(), toolA)
      endTool(toolA.span, 'result-a', 1)
      assert.equal(toolA.ended, true)
      assert.equal(exactToolStorage.getStore(), undefined)
    })

    const toolC = trackTool('c')
    const toolD = trackTool('d')
    await Promise.all([
      exactToolStorage.run(toolC, async () => {
        await Promise.resolve()
        endTool(toolC.span)
      }),
      exactToolStorage.run(toolD, async () => {
        await new Promise(resolve => setImmediate(resolve))
        endTool(toolD.span)
      }),
    ])
    assert.equal(toolC.span.endCount, 1)
    assert.equal(toolD.span.endCount, 1)
    assert.equal(exactActive.size, 0)
    assert.equal(exactStrong.size, 0)
  },
)

test(
  'authored source owns the live-context, scoped-turn, and exact-span graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const tracing = source('utils/telemetry/sessionTracing.ts')
    const toolExecution = source('services/tools/toolExecution.ts')
    const interactive = source('utils/handlePromptSubmit.ts')
    const headless = source('cli/print.ts')
    const processTextPrompt = source(
      'utils/processUserInput/processTextPrompt.ts',
    )

    assert.match(
      tracing,
      /function getInteractionSpanContext\(\): SpanContext \| undefined[\s\S]*?current && !current\.ended[\s\S]*?!spanContext\.ended[\s\S]*?\['span\.type'\] === 'interaction'/,
    )
    assert.match(
      tracing,
      /function getActiveToolSpanContext\(\): SpanContext \| undefined[\s\S]*?current && !current\.ended/,
    )
    assert.match(
      tracing,
      /export function runWithInteractionSpan<T>[\s\S]*?startInteractionSpan\(userPrompt\)[\s\S]*?interactionContext\.run\(spanContext, fn\)[\s\S]*?interactionContext\.getStore\(\) === spanContext[\s\S]*?interactionContext\.enterWith\(undefined\)/,
    )
    assert.match(
      tracing,
      /export function endInteractionSpan\(\): void \{\s*const spanContext = getInteractionSpanContext\(\)/,
    )
    assert.match(
      tracing,
      /const toolSpanCtx = getActiveToolSpanContext\(\)\s*const parentSpanCtx = toolSpanCtx \?\? getInteractionSpanContext\(\)/,
    )
    assert.match(
      tracing,
      /const parentSpanCtx =\s*getActiveToolSpanContext\(\) \?\? getInteractionSpanContext\(\)/,
    )
    const executionEnd = tracing.slice(
      tracing.indexOf('export function endToolExecutionSpan'),
      tracing.indexOf('export function endToolSpan'),
    )
    assert.match(
      executionEnd,
      /const executionSpanContext = toolExecutionContext\.getStore\(\)/,
    )
    assert.doesNotMatch(executionEnd, /findLast/)
    const toolEnd = tracing.slice(
      tracing.indexOf('export function endToolSpan'),
      tracing.indexOf('function isToolContentLoggingEnabled'),
    )
    assert.match(toolEnd, /span\?: Span/)
    assert.match(toolEnd, /activeSpans\.get\(getSpanId\(span\)\)\?\.deref\(\)/)
    assert.match(toolEnd, /toolSpanContext\.ended = true/)
    assert.match(
      toolEnd,
      /if \(isCurrentToolContext\) \{\s*toolContext\.enterWith\(undefined\)/,
    )

    assert.match(toolExecution, /const toolSpan = startToolSpan\(/)
    assert.equal(occurrences(toolExecution, 'endToolSpan(toolSpan)'), 2)
    assert.equal(
      occurrences(toolExecution, 'endToolSpan(toolSpan, toolResultStr)'),
      1,
    )
    assert.equal(occurrences(toolExecution, 'endToolSpan()'), 0)

    for (const caller of [interactive, headless]) {
      assert.match(caller, /runWithWorkload\([\s\S]*?runWithInteractionSpan\(/)
      assert.match(caller, /extractTextContent\([^)]*, '\\n'\)/)
      assert.match(caller, /endInteractionSpan\(\)/)
    }
    assert.equal(
      occurrences(interactive, 'runWithInteractionSpan(interactionPrompt'),
      1,
    )
    assert.equal(
      occurrences(headless, 'runWithInteractionSpan(interactionPrompt'),
      1,
    )
    assert.doesNotMatch(processTextPrompt, /startInteractionSpan/)
  },
)

test(
  'the authenticated lifecycle graph persists through 2.1.116',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 bundle is required'
        : false,
  },
  () => {
    const latest = bundle(latestPath, LATEST_SHA256)
    for (const [index, start, end, sourceHash] of latestUnits) {
      assert.equal(sha256(latest.slice(start, end)), sourceHash, `unit ${index}`)
    }
    assert.match(latest.slice(5073602, 5073797), /!.*\.ended.*findLast.*!.*\.ended/s)
    assert.match(latest.slice(5074714, 5074833), /\.run\(.*\).*finally.*===/s)
    assert.match(latest.slice(5077885, 5078555), /\(\)\?\?.*\(\)/)
    assert.match(latest.slice(5080004, 5080383), /\.getStore\(\)/)
    assert.equal(occurrences(latest.slice(8589712, 8603636), 'YF$('), 3)
    assert.equal(occurrences(latest.slice(11899357, 11901347), 'zF$('), 1)
    assert.equal(occurrences(latest.slice(12915603, 12954120), 'zF$('), 1)
    assert.match(latest.slice(11899357, 11901347), /finally\{.*\(\)\}\}$/)
    assert.match(latest.slice(12915603, 12954120), /finally\{Xl\(\)\}/)
  },
)
