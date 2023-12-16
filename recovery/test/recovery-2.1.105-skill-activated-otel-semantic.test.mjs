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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

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
  [
    11245,
    [
      8787181,
      8788813,
      'FunctionDeclaration',
      'fa1aebe140ee2f503146637393e2acda1da260f7d52cb8223ec755627eaa27c1',
    ],
  ],
  [
    11247,
    [
      8789064,
      8789362,
      'FunctionDeclaration',
      '7a3731a2307dbb7b0f81a0d38314b8cf3ac3c0b769a0341e1bf094f5172195f8',
    ],
  ],
  [
    11250,
    [
      8789508,
      8795522,
      'VariableDeclaration',
      '0bf773063903d973879cfdc508508a5dcbef9fdbd32cefbaa53bb6298eb5bb63',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function extractFunction(contents, functionName) {
  const start = contents.indexOf(`function ${functionName}(`)
  assert.notEqual(start, -1, `${functionName} must exist`)
  const brace = contents.indexOf('{', start)
  assert.notEqual(brace, -1, `${functionName} body must exist`)
  let depth = 0
  for (let index = brace; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}') {
      depth--
      if (depth === 0) return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${functionName} body is unterminated`)
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

async function executeSkillLogger(ownerContents) {
  const ts = await loadTypeScript()
  const helper = extractFunction(ownerContents, 'logSkillActivated')
  const moduleSource = `
    import type { Command } from 'src/types/command.js'
    import { isEnvTruthy } from 'src/utils/envUtils.js'
    import {
      isOfficialMarketplaceName,
      parsePluginIdentifier,
    } from 'src/utils/plugins/pluginIdentifier.js'
    import { logOTelEvent } from 'src/utils/telemetry/events.js'
    ${helper}
    export { logSkillActivated }
  `
  const javascript = ts.transpileModule(moduleSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const events = []
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id.endsWith('/envUtils.js')) {
        return {
          isEnvTruthy: value =>
            value === '1' || value?.toLowerCase() === 'true',
        }
      }
      if (id.endsWith('/pluginIdentifier.js')) {
        return {
          parsePluginIdentifier: repository => ({
            marketplace: repository.split('@')[1],
          }),
          isOfficialMarketplaceName: marketplace =>
            marketplace === 'official',
        }
      }
      if (id.endsWith('/events.js')) {
        return {
          logOTelEvent: (eventName, metadata) => {
            events.push({ eventName, metadata })
          },
        }
      }
      throw new Error(`unexpected skill logger import: ${id}`)
    },
    module.exports,
    module,
  )
  return { events, helper, log: module.exports.logSkillActivated }
}

test(
  'authenticated target105 pins skill activation telemetry and both invocation paths',
  bundleOptions,
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
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'skill_activated'), 0)
    assert.equal(occurrences(target, 'skill_activated'), 1)
    assert.equal(occurrences(latest, 'skill_activated'), 1)
    assert.equal(occurrences(target, '"skill.name"'), 1)
    assert.equal(occurrences(latest, '"skill.name"'), 1)
    assert.equal(occurrences(target, 'custom_skill'), 0)
    assert.equal(occurrences(latest, 'custom_skill'), 1)
    assert.match(target.slice(8787181, 8788813), /\w+\([^,]+,[^)]*\);let/)
    assert.match(target.slice(8793804, 8794100), /\w+\([^,]+,[^)]*\);let/)
  },
)

test(
  'authored source retains one helper reached by forked and inline skill execution',
  sourceOptions,
  () => {
    const owner = source('tools/SkillTool/SkillTool.ts')
    assert.equal(occurrences(owner, "logOTelEvent('skill_activated'"), 1)
    assert.equal(occurrences(owner, 'logSkillActivated('), 3)
    assert.match(owner, /'skill\.name'/)
    assert.match(owner, /'skill\.source'/)
    assert.match(owner, /'skill\.kind'/)
    assert.match(owner, /'plugin\.name'/)
    assert.match(owner, /'marketplace\.name'/)

    const helper = extractFunction(owner, 'logSkillActivated')
    if (helper.includes("'custom_skill'")) {
      assert.match(helper, /OTEL_LOG_TOOL_DETAILS/)
      assert.match(helper, /isOfficialMarketplaceName\(marketplace\)/)
    } else {
      assert.doesNotMatch(helper, /OTEL_LOG_TOOL_DETAILS|custom_skill/)
      assert.match(helper, /'skill\.name': commandName/)
    }
  },
)

test(
  'skill activation telemetry executes target105 raw and target116 redacted policies',
  sourceOptions,
  async () => {
    const { events, helper, log } = await executeSkillLogger(
      source('tools/SkillTool/SkillTool.ts'),
    )
    const thirdParty = {
      type: 'prompt',
      source: 'plugin',
      kind: 'command',
      pluginInfo: {
        repository: 'package@third-party',
        pluginManifest: { name: 'secret-plugin' },
      },
    }

    const previous = process.env.OTEL_LOG_TOOL_DETAILS
    delete process.env.OTEL_LOG_TOOL_DETAILS
    try {
      log('secret-skill', thirdParty)
      if (helper.includes("'custom_skill'")) {
        assert.deepEqual(events.pop(), {
          eventName: 'skill_activated',
          metadata: {
            'skill.name': 'custom_skill',
            'skill.source': 'plugin',
            'skill.kind': 'command',
          },
        })

        log('builtin-name', { type: 'prompt', source: 'bundled' })
        assert.equal(events.pop().metadata['skill.name'], 'builtin-name')

        process.env.OTEL_LOG_TOOL_DETAILS = '1'
        log('secret-skill', thirdParty)
        assert.deepEqual(events.pop().metadata, {
          'skill.name': 'secret-skill',
          'skill.source': 'plugin',
          'skill.kind': 'command',
          'plugin.name': 'secret-plugin',
          'marketplace.name': 'third-party',
        })
      } else {
        log('secret-skill', thirdParty)
        assert.deepEqual(events.pop().metadata, {
          'skill.name': 'secret-skill',
          'skill.source': 'plugin',
          'skill.kind': 'command',
          'plugin.name': 'secret-plugin',
          'marketplace.name': 'third-party',
        })
      }
    } finally {
      if (previous === undefined) delete process.env.OTEL_LOG_TOOL_DETAILS
      else process.env.OTEL_LOG_TOOL_DETAILS = previous
    }
  },
)
