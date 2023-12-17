import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

const targetHelper = {
  index: 15069,
  start: 11141497,
  end: 11141543,
  hash: '3d10b55e3c0fda26f94b3d0963ba2ddba6cf1ab5aa7eceddf37e54cc033b462e',
}
const targetWrapper = {
  index: 15070,
  start: 11141543,
  end: 11141936,
  hash: '7fc7e06324378e9b56064dd0d586443a063d0f2e203897b247b4b8de92385619',
}
const targetCaller = {
  index: 18386,
  start: 12731362,
  end: 12789746,
  hash: 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

test(
  'authenticated target105 moves message deferral and placeholder lifetime into Messages',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const unit of [targetHelper, targetWrapper, targetCaller]) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.index,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [unit.index, unit.start, unit.end, unit.hash],
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.hash)
    }

    assert.equal(occurrences(baseline, 'deferMessages'), 0)
    assert.equal(occurrences(target, 'deferMessages'), 2)
    assert.equal(occurrences(latest, 'deferMessages'), 2)
    assert.equal(occurrences(baseline, 'placeholderBaseline'), 0)
    assert.equal(occurrences(target, 'placeholderBaseline'), 2)
    assert.equal(occurrences(latest, 'placeholderBaseline'), 2)
    assert.equal(occurrences(baseline, 'placeholderElement'), 2)
    assert.equal(occurrences(target, 'placeholderElement'), 4)
    assert.equal(occurrences(latest, 'placeholderElement'), 4)

    const helper = target.slice(targetHelper.start, targetHelper.end)
    const wrapper = target.slice(targetWrapper.start, targetWrapper.end)
    const caller = target.slice(targetCaller.start, targetCaller.end)
    assert.match(helper, /return _&&q\[0\]===K\[0\]\?q:K/)
    assert.match(wrapper, /useDeferredValue\(A\.messages\)/)
    assert.match(wrapper, /Y&&z!==void 0&&w\.length<=z&&Y/)
    assert.match(caller, /deferMessages:![^,]+&&![^,]+&&[^,]+,placeholderBaseline:/)
    assert.match(caller, /placeholderElement:![^,]+&&![^,]+&&![^,]+&&[^?]+\?/)
  },
)

test(
  'source Messages owns deferred selection and REPL supplies the exact gates',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const messagesPath = path.join(sourceRoot, 'components/Messages.tsx')
    const replPath = path.join(sourceRoot, 'screens/REPL.tsx')
    const messages = fs.readFileSync(messagesPath, 'utf8')
    const repl = fs.readFileSync(replPath, 'utf8')
    const ts = await loadTypeScript()
    const parsed = ts.createSourceFile(
      messagesPath,
      messages,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const helper = parsed.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'selectMessagesForRender',
    )
    assert.ok(helper, 'selectMessagesForRender must exist')
    const compiled = ts.transpileModule(
      `${helper.getText(parsed)}\nglobalThis.selectMessagesForRender = selectMessagesForRender`,
      {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const context = {}
    vm.runInNewContext(compiled, context)
    const select = context.selectMessagesForRender
    const first = { id: 'first' }
    const current = [first, { id: 'new' }]
    const deferred = [first]
    assert.equal(select(deferred, current, true), deferred)
    assert.equal(select(deferred, current, false), current)
    assert.equal(select([{ id: 'other' }], current, true), current)

    assert.match(messages, /React\.useDeferredValue\(props\.messages\)/)
    assert.match(
      messages,
      /placeholderElement && placeholderBaseline !== undefined && messages\.length <= placeholderBaseline/,
    )
    assert.match(
      repl,
      /deferMessages=\{!viewedAgentTask && !showStreamingText && isLoading\}/,
    )
    assert.match(
      repl,
      /placeholderBaseline=\{userInputBaselineRef\.current\}/,
    )
    assert.match(
      repl,
      /placeholderElement=\{!disabled && !viewedAgentTask && !centeredModal && userInputOnProcessing \?/,
    )
    assert.doesNotMatch(repl, /const usesSyncMessages =/)
    assert.doesNotMatch(repl, /const placeholderText =/)
  },
)
