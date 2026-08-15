import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalSource = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const bundlePaths = {
  110: process.env.CLAUDE_CODE_2_1_110_BUNDLE,
  111: process.env.CLAUDE_CODE_2_1_111_BUNDLE,
  112: process.env.CLAUDE_CODE_2_1_112_BUNDLE,
  113: process.env.CLAUDE_CODE_2_1_113_BUNDLE,
  114: process.env.CLAUDE_CODE_2_1_114_BUNDLE,
  116: process.env.CLAUDE_CODE_2_1_116_BUNDLE,
}

const bundleHashes = {
  110: new Set([
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  ]),
  111: new Set([
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  ]),
  112: new Set([
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  ]),
  113: new Set([
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
  ]),
  114: new Set([
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    '5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83',
  ]),
  116: new Set([
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  ]),
}

const introUnits = {
  helper: {
    index: 13_591,
    start: 9_924_167,
    end: 9_924_286,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '0c343cd8580fcc99fe4cec92c59da5769d2d6905123682de764325d214de9cbb',
  },
  caller: {
    index: 13_597,
    start: 9_925_489,
    end: 9_930_598,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '52aac15653e0048a08dd1f9ea64488b891a00e6697038246c2c6fa6bfd7b5403',
  },
  baselineCaller: {
    index: 13_540,
    start: 9_907_569,
    end: 9_912_352,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '13bed8edbc4ed929a92e30523a46a57d1bbe50702369c11d41a942795e8e5830',
  },
}

const hardenedUnits = {
  baselineOperator: {
    index: 13_563,
    start: 9_915_256,
    end: 9_916_639,
    sourceHash:
      '8a8d40aeaf360bd69e223ad8daebf1430d49b5dae2020808097004e08500e522',
  },
  baselineHelper: {
    index: 13_592,
    start: 9_924_224,
    end: 9_924_343,
    sourceHash:
      'ff15a4291258914b6e26fd1df759ba41c50dee3843aa92003d5c0b679c2b5d9f',
  },
  baselineCaller: {
    index: 13_598,
    start: 9_925_546,
    end: 9_930_655,
    sourceHash:
      '2da06da56e23edc15c8ca0b48d8d6eb07e8d732a7989c4f7f08099cb6aaf84b2',
  },
  helper: {
    index: 14_661,
    start: 9_207_810,
    end: 9_207_957,
    sourceHash:
      '9789aef1877347a8a9bd3a2ad1074fd93b0c75a7d462492f7d9589d7fd5b29b9',
  },
  operator: {
    index: 14_630,
    start: 9_196_757,
    end: 9_198_282,
    sourceHash:
      'ec937ec9d550e516c9f3dc3cf41caf14ee79ad806fedc585f8a2d38432437642',
  },
  caller: {
    index: 14_672,
    start: 9_210_494,
    end: 9_215_749,
    sourceHash:
      '6ecf8ba409f2d4d30d8b7598a7bb5598e831c302f3c8b8e0a7c59d700de3a31e',
  },
  latestHelper: {
    index: 14_798,
    start: 9_259_560,
    end: 9_259_707,
    sourceHash:
      '6389ad25212fb42312797c2ff754c050c137e3b88b4dcf2570073051a54d84d8',
  },
  latestOperator: {
    index: 14_767,
    start: 9_248_313,
    end: 9_249_838,
    sourceHash:
      'd18a44d5fac2493d289337d4fc2021ae7fb096c72ca29d7c46c7e730483c3020',
  },
  latestCaller: {
    index: 14_810,
    start: 9_262_218,
    end: 9_267_457,
    sourceHash:
      '5afd6211679036ffdb38c64e2af1dfc03eba0ef5e5a9a1f1245e3d8dbbb78bac',
  },
}

const structural111 = JSON.parse(
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
const structural113 = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.112-to-2.1.113/structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function normalizeLateBundle(version, bytes) {
  const hash = sha256(bytes)
  assert.ok(bundleHashes[version].has(hash), `${version}: unexpected bundle`)
  const source = bytes.toString('utf8')
  if (version < 113 || hash === [...bundleHashes[version]][0]) return source
  const prefix =
    '// @bun @bytecode @bun-cjs\n(function(exports, require, module, __filename, __dirname) {'
  assert.ok(source.startsWith(prefix))
  assert.ok(source.endsWith('})\n'))
  return source.slice(prefix.length, -3)
}

function assertUnit(source, unit) {
  assert.equal(sha256(source.slice(unit.start, unit.end)), unit.sourceHash)
}

function identity(unit) {
  return [unit.index, unit.start, unit.end, unit.nodeType, unit.sourceHash]
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

test(
  'target111 introduces the live leading-cd context graph and target113 hardens it',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : Object.values(bundlePaths).some(value => !value)
        ? 'authenticated 110, 111, 112, 113, 114, and 116 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const bundles = Object.fromEntries(
      Object.entries(bundlePaths).map(([version, filename]) => {
        const bytes = fs.readFileSync(filename)
        return [version, normalizeLateBundle(Number(version), bytes)]
      }),
    )

    assertUnit(bundles[110], introUnits.baselineCaller)
    assertUnit(bundles[111], introUnits.helper)
    assertUnit(bundles[111], introUnits.caller)
    assert.equal(occurrences(bundles[110], 'replaceAll("&&","")'), 0)
    assert.equal(occurrences(bundles[111], 'replaceAll("&&","")'), 1)
    assert.equal(
      occurrences(
        bundles[111].slice(
          introUnits.caller.start,
          introUnits.caller.end,
        ),
        'fkY(q.command)',
      ),
      1,
    )

    assert.deepEqual(
      identity(structural111.regions[introUnits.helper.index].target),
      identity(introUnits.helper),
    )
    assert.deepEqual(
      identity(structural111.regions[introUnits.caller.index].target),
      identity(introUnits.caller),
    )
    assert.ok(
      structural111.unmatchedBaseline.some(
        unit =>
          unit.index === introUnits.baselineCaller.index &&
          unit.sourceHash === introUnits.baselineCaller.sourceHash,
      ),
    )

    assertUnit(bundles[112], hardenedUnits.baselineOperator)
    assertUnit(bundles[112], hardenedUnits.baselineHelper)
    assertUnit(bundles[112], hardenedUnits.baselineCaller)
    assertUnit(bundles[113], hardenedUnits.operator)
    assertUnit(bundles[113], hardenedUnits.helper)
    assertUnit(bundles[113], hardenedUnits.caller)
    const helper113 = bundles[113].slice(
      hardenedUnits.helper.start,
      hardenedUnits.helper.end,
    )
    assert.match(helper113, /includes\(`\n`\)/)
    const operator113 = bundles[113].slice(
      hardenedUnits.operator.start,
      hardenedUnits.operator.end,
    )
    assert.match(operator113, /if\(!\(_\?await _\(j\):!1\)\)/)
    assert.ok(
      operator113.indexOf('behavior==="deny"') <
        operator113.indexOf('bashMissKind:"multi-cd"'),
    )
    const caller113 = bundles[113].slice(
      hardenedUnits.caller.start,
      hardenedUnits.caller.end,
    )
    assert.match(caller113, /T31\(H\.command\)/)
    assert.match(caller113, /k31\(P\[0\],j,K\.toolPermissionContext\)/)
    assert.match(caller113, /!await V31\(P,X,j\)/)
    assert.match(caller113, /k&&n===0\?j:W/)

    assert.deepEqual(
      identity(structural113.regions[hardenedUnits.helper.index].target),
      [
        hardenedUnits.helper.index,
        hardenedUnits.helper.start,
        hardenedUnits.helper.end,
        'FunctionDeclaration',
        hardenedUnits.helper.sourceHash,
      ],
    )
    assert.deepEqual(
      identity(structural113.regions[hardenedUnits.operator.index].target),
      [
        hardenedUnits.operator.index,
        hardenedUnits.operator.start,
        hardenedUnits.operator.end,
        'FunctionDeclaration',
        hardenedUnits.operator.sourceHash,
      ],
    )
    assert.deepEqual(
      identity(structural113.regions[hardenedUnits.caller.index].target),
      [
        hardenedUnits.caller.index,
        hardenedUnits.caller.start,
        hardenedUnits.caller.end,
        'FunctionDeclaration',
        hardenedUnits.caller.sourceHash,
      ],
    )

    assertUnit(bundles[116], hardenedUnits.latestOperator)
    assertUnit(bundles[116], hardenedUnits.latestHelper)
    assertUnit(bundles[116], hardenedUnits.latestCaller)
    assert.equal(occurrences(bundles[114], 'replaceAll("&&","")'), 1)
    assert.equal(occurrences(bundles[116], 'replaceAll("&&","")'), 1)
  },
)

test(
  'source preserves fail-closed syntax while propagating a validated leading-cd cwd',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'tools/BashTool/bashPermissions.ts'),
      'utf8',
    )
    const helpers = fs.readFileSync(
      path.join(sourceRoot, 'tools/BashTool/bashCommandHelpers.ts'),
      'utf8',
    )
    for (const fragment of [
      'function canUseLeadingCdAsWorkingDirectory',
      "command.includes('||') || command.includes(';')",
      "command.replaceAll('&&', '').includes('&')",
      'function resolveLeadingCdWorkingDirectory',
      "validatePath(\n    target,\n    cwd,\n    toolPermissionContext,\n    'read',",
      'pathInAllowedWorkingPath(resolvedPath, toolPermissionContext',
      'subcommands.length === rawSubcommands.length',
      'permissionCwd = resolvedCwd',
      'pathCommandHasCd = false',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }

    if (historicalSource) {
      const leadingGuard = owner.slice(
        owner.indexOf('function canUseLeadingCdAsWorkingDirectory'),
        owner.indexOf('function resolveLeadingCdWorkingDirectory'),
      )
      assert.equal(leadingGuard.includes("command.includes('\\n')"), false)
      for (const laterFragment of [
        'function astCdCommandsKeepCurrentDirectory',
        'function textualCdCommandsKeepCurrentDirectory',
        'adjustedForLeadingCd',
      ]) {
        assert.equal(owner.includes(laterFragment), false, laterFragment)
      }
      assert.equal(helpers.includes('cdCommandsKeepCurrentDirectory'), false)
    } else {
      for (const laterFragment of [
        "command.includes('\\n')",
        'function astCdCommandsKeepCurrentDirectory',
        'function textualCdCommandsKeepCurrentDirectory',
        'adjustedForLeadingCd && i === 0 ? cwd : permissionCwd',
        '.slice(adjustedForLeadingCd ? 1 : 0)',
      ]) {
        assert.ok(owner.includes(laterFragment), laterFragment)
      }
      assert.match(
        owner,
        /hasGitCommand &&[\s\S]*astCdCommandsKeepCurrentDirectory\([\s\S]*This command changes directory before running git/,
      )
      assert.match(
        helpers,
        /hasCd &&[\s\S]*hasGit &&[\s\S]*cdCommandsKeepCurrentDirectory\?\.\(compoundSubcommands\)/,
      )
      assert.ok(
        helpers.indexOf("result.behavior === 'deny'") <
          helpers.indexOf("bashMissKind: 'multi-cd'"),
      )
    }

    const ts = await loadTypeScript()
    const ast = ts.createSourceFile(
      'bashPermissions.ts',
      owner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const names = new Set([
      'canUseLeadingCdAsWorkingDirectory',
      'resolveLeadingCdWorkingDirectory',
      ...(!historicalSource
        ? [
            'isExplicitCdPath',
            'parseSimpleCdPath',
            'normalizedRealpath',
            'cdPathResolvesToCwd',
            'astCdCommandsKeepCurrentDirectory',
            'textualCdCommandsKeepCurrentDirectory',
          ]
        : []),
    ])
    const declarations = ast.statements.filter(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        names.has(statement.name.text),
    )
    assert.equal(declarations.length, names.size)
    const extracted = declarations
      .map(statement => owner.slice(statement.pos, statement.end))
      .join('\n')
    const exportNames = [...names].join(',')
    const transpiled = ts.transpileModule(
      `${extracted}\nmodule.exports={${exportNames}}`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: 'leading-cd.ts',
        reportDiagnostics: true,
      },
    )
    const errors = (transpiled.diagnostics ?? []).filter(
      diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
    )
    assert.deepEqual(
      errors.map(error =>
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
      ),
      [],
    )

    const realpaths = new Map([
      ['/repo', '/repo'],
      ['/repo/.', '/repo'],
      ['/repo/link', '/repo'],
      ['/repo/sub', '/repo/sub'],
    ])
    const module = { exports: {} }
    new Function(
      'module',
      'exports',
      'isAbsolute',
      'resolve',
      'realpath',
      'getPlatform',
      'validatePath',
      'pathInAllowedWorkingPath',
      'isNormalizedCdCommand',
      transpiled.outputText,
    )(
      module,
      module.exports,
      path.isAbsolute,
      path.resolve,
      async value => {
        const resolved = realpaths.get(value)
        if (!resolved) throw new Error('ENOENT')
        return resolved
      },
      () => 'linux',
      (value, cwd) => ({
        allowed: value !== '../blocked',
        resolvedPath: path.resolve(cwd, value),
      }),
      value => !value.includes('blocked'),
      value => /^cd(?:\s|$)/.test(value.trim()),
    )
    const runtime = module.exports

    assert.equal(runtime.canUseLeadingCdAsWorkingDirectory('cd sub && ls'), true)
    for (const command of ['cd sub || ls', 'cd sub; ls', 'cd sub & ls']) {
      assert.equal(runtime.canUseLeadingCdAsWorkingDirectory(command), false)
    }
    assert.equal(
      runtime.canUseLeadingCdAsWorkingDirectory('cd sub\nls'),
      historicalSource,
    )

    const simple = target => ({
      argv: ['cd', target],
      envVars: [],
      redirects: [],
    })
    assert.equal(
      runtime.resolveLeadingCdWorkingDirectory(simple('./sub'), '/repo', {}),
      '/repo/sub',
    )
    assert.equal(
      runtime.resolveLeadingCdWorkingDirectory(
        simple('../blocked'),
        '/repo',
        {},
      ),
      null,
    )

    if (historicalSource) return

    assert.equal(runtime.parseSimpleCdPath("cd './sub'"), './sub')
    assert.equal(runtime.parseSimpleCdPath('cd ./two words'), null)
    assert.equal(runtime.parseSimpleCdPath('pushd ./sub'), null)
    assert.equal(
      await runtime.astCdCommandsKeepCurrentDirectory(
        [simple('.'), { argv: ['git', 'status'], envVars: [], redirects: [] }],
        ['cd .', 'git status'],
        '/repo',
      ),
      true,
    )
    assert.equal(
      await runtime.astCdCommandsKeepCurrentDirectory(
        [
          simple('./sub'),
          { argv: ['git', 'status'], envVars: [], redirects: [] },
        ],
        ['cd ./sub', 'git status'],
        '/repo',
      ),
      false,
    )
    assert.equal(
      await runtime.textualCdCommandsKeepCurrentDirectory(
        ['cd ./link', 'git status'],
        '/repo',
      ),
      true,
    )
  },
)
