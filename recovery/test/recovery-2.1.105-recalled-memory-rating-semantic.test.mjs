import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
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
  [10709, ['unresolved', 8521614, 8521785, 'aadc6515d8aba55f0ee74160e0d09f17db8973e0e13659ae4c3b893339d543ef']],
  [10710, ['unresolved', 8521785, 8521854, '5d0a1973fe9f5cf4743e6c454735d2c26181829cd7f5ed6b241c16c50db8bdc3']],
  [10711, ['unresolved', 8521854, 8521920, '273defb796486c3e645b6bd2249ae260dfa2fe842e8db44b46533e46ed432bf1']],
  [10712, ['unresolved', 8521920, 8522071, '06a9e0f821df7ffd76ffae540c07f04d626977952c8ea290072e5cf6d91876ec']],
  [10713, ['unresolved', 8522071, 8523708, '8be5ad143646a4945decee23db62455f0c00270f4194a5360272c714b99614b7']],
  [10714, ['unresolved', 8523708, 8524005, 'e242586957e135029a75ec4c76c98093623504a91337f6f2bdf793fdb0815f05']],
  [10715, ['unresolved', 8524005, 8524050, '16fbab517246bec2dc782bec237b5d6b49331200d4dc2f581f0f78194a0c5f65']],
  [10716, ['unresolved', 8524050, 8524706, '4d1e12030fa82d78588be8cf833283c36243305de7375ce629d06d3352918671']],
  [10717, ['unresolved', 8524706, 8524746, 'ba8c2dabc716264e26ecc21aef2bf691701373f8e10456a0b845248da3b58cdd']],
  [10718, ['unresolved', 8524746, 8525490, 'a1e75ee540743f10fe8a31ba6ac65254e7ae7c724645f107acbbf70b2856ea27']],
  [10719, ['unresolved', 8525490, 8525604, '8d3bb5854aa3b268e5f993663dc6796c7674a085d0e3ff1f6410b9167f91f179']],
  [10720, ['unresolved', 8525604, 8525633, 'd50789de32bce1ae9fed9688a334b8a6f08e083e1acf50220456e456a236367d']],
  [10721, ['unresolved', 8525633, 8525727, 'a1e53aa66ad1d8e0a5e7f81823dbbff068fb30a6f1b8b64cf61ce23990163cab']],
  [10794, ['unresolved', 8547875, 8554873, '20e5de4193ad7caf77eb66145fde0832a59c2c9a35fdc8bde7baa38642033f7d']],
  [10881, ['unresolved', 8595235, 8599671, '9280815997b437415c587dfdf53e25d27ce180e0adc9992c3fe2104a392e7230']],
  [18386, ['unresolved', 12731362, 12789746, 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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
  'target105 pins the recalled-memory display, rating, and hotkey graph',
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
    for (const [index, [classification, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal(baseline.includes('Recalled from memory'), false)
    assert.equal((target.match(/Recalled from memory/g) ?? []).length, 2)
    assert.equal((latest.match(/Recalled from memory/g) ?? []).length, 2)
    assert.equal(baseline.includes('cited_team_count'), false)
    assert.equal((target.match(/cited_team_count/g) ?? []).length, 1)
    assert.equal((latest.match(/cited_team_count/g) ?? []).length, 1)
    for (const marker of ['[Good]', '[Bad]', 'tiny_memory', '^<synthesis:(.+)>$']) {
      assert.ok(target.includes(marker), `target105 ${marker}`)
      assert.ok(latest.includes(marker), `target116 ${marker}`)
    }
  },
)

test(
  'authored source executes synthesis parsing and owns every reachable rating call path',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('components/messages/RecalledMemory.tsx')
    const attachment = source('components/messages/AttachmentMessage.tsx')
    const message = source('components/Message.tsx')
    const repl = source('screens/REPL.tsx')
    for (const fragment of [
      "const SYNTHESIS_SOURCES_SEPARATOR = '\\n\\nSources: '",
      'const SYNTHESIS_PATH = /^<synthesis:(.+)>$/',
      "source.startsWith('team/') || source.startsWith('team\\\\')",
      'cited_team_count: citedTeamCount',
      'cited_private_count: citedPrivateCount',
      'Recalled from memory',
      'label="[Good]"',
      'label="[Bad]"',
      "'tiny_memory'",
      "value === '+' || value === '-'",
      'messages.findLast(isSynthesizedMemoryAttachment)',
      'useDebouncedDigitInput({',
    ]) assert.ok(owner.includes(fragment), fragment)
    assert.ok(
      attachment.includes(
        'isTinyMemoryEnabled() && allMemoriesAreSyntheses(attachment.memories)',
      ),
    )
    assert.ok(
      attachment.includes(
        '<RecalledMemory memories={attachment.memories} messageUuid={messageUuid}',
      ),
    )
    assert.ok(message.includes('messageUuid={message.uuid}'))
    assert.ok(message.includes('$[3] !== message.uuid || $[4] !== verbose'))
    assert.ok(
      repl.includes(
        'isTinyMemoryEnabled() && isFullscreenEnvEnabled() && <RecalledMemoryRatingInput',
      ),
    )
    assert.ok(
      repl.includes(
        'enabled={!disabled && !focusedInputDialog && !viewedAgentTask}',
      ),
    )

    const start = owner.indexOf('const SYNTHESIS_SOURCES_SEPARATOR')
    const end = owner.indexOf('function stripSynthesisBullet')
    assert.ok(start >= 0 && end > start)
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(owner.slice(start, end), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    assert.deepEqual(module.exports.parseSynthesisContent('plain'), {
      synthesis: 'plain',
      sources: [],
    })
    assert.deepEqual(
      module.exports.parseSynthesisContent(
        '- first\n- second\n\nSources: team/alpha.md, private.md, team\\beta.md',
      ),
      {
        synthesis: '- first\n- second',
        sources: ['team/alpha.md', 'private.md', 'team\\beta.md'],
      },
    )
    assert.deepEqual(
      module.exports.getMemoryScopeCounts([
        {
          path: '<synthesis:one>',
          content: 'one\n\nSources: team/a.md, private.md',
        },
        {
          path: '<synthesis:two>',
          content: 'two\n\nSources: team\\b.md',
        },
      ]),
      { cited_team_count: 2, cited_private_count: 1 },
    )
    assert.equal(module.exports.allMemoriesAreSyntheses([]), false)
    assert.equal(
      module.exports.allMemoriesAreSyntheses([
        { path: '<synthesis:one>', content: 'one' },
      ]),
      true,
    )
    assert.equal(
      module.exports.allMemoriesAreSyntheses([
        { path: 'MEMORY.md', content: 'one' },
      ]),
      false,
    )
  },
)
