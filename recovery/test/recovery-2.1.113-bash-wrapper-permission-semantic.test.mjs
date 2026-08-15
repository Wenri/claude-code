import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_112_BUNDLE and CLAUDE_CODE_2_1_113_BUNDLE are required'
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

const targetUnits = new Map([
  [
    14650,
    [
      9202151,
      9202648,
      '7e955d63279a78df4738e0706a12007b2fb5740e8c38ddc2ccc0a633247da890',
    ],
  ],
  [
    14651,
    [
      9202648,
      9202958,
      '75d080a4b4ed4e8627cbe1da432f9e19deaafb64d9608e5471de422ec34224fe',
    ],
  ],
  [
    14654,
    [
      9203547,
      9204532,
      'b8b4d67cadd1ebcc58add1835874d1359dfa248819bf26fd1aefc07a91e900ee',
    ],
  ],
  [
    14655,
    [
      9204532,
      9205642,
      'a14aa9c3118f22e178c048ae8cd82a40e44d7b2e3898f17954cb409a99f9194b',
    ],
  ],
  [
    14656,
    [
      9205642,
      9206000,
      'a8257dab651243fc2f33c05030b84ba9c97425b20b46f52ff9b3673e5f7fbd31',
    ],
  ],
  [
    14659,
    [
      9206704,
      9207628,
      '3e3891a7f0946878410dfed99927f70a4ba039ff917e6344a658e760c05a9e75',
    ],
  ],
  [
    14677,
    [
      9217873,
      9220741,
      'b701cf17862aa728bd971a8556260c17646b421398233ab8c030aedb1bbdd70a',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticatedTargetInner(bytes) {
  const digest = sha256(bytes)
  if (
    digest ===
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
  ) {
    return bytes.toString('utf8')
  }
  assert.equal(
    digest,
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
    'authenticated target113 wrapper',
  )
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(
    sha256(inner),
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    'authenticated target113 inner',
  )
  return inner.toString('utf8')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

async function instantiateWrapperHarness() {
  const owner = source('src/tools/BashTool/bashPermissions.ts')
  const start = owner.indexOf('const TIMEOUT_FLAG_VALUE_RE =')
  // BINARY_HIJACK_VARS moves from before stripWrappersFromArgv in the
  // introduction-era owner to after it in the cumulative owner.  Bound the
  // harness on the next stable exported function so both authentic source
  // layouts include the complete wrapper implementation and its constants.
  const end = owner.indexOf('export function stripAllLeadingEnvVars', start)
  assert.ok(start >= 0 && end > start, 'wrapper implementation range')

  const ts = await loadTypeScript()
  const result = ts.transpileModule(owner.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'wrapper slice must transpile')
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

test('2.1.113 authenticates the argv wrapper permission graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = authenticatedTargetInner(targetBytes)

  assert.equal(baseline.includes('--split-string'), false)
  assert.equal(target.split('--split-string').length - 1, 1)
  for (const [index, [start, end, sourceHash]] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  const parser = target.slice(9203547, 9204532)
  for (const fragment of [
    'q==="command"&&(O==="-v"||O==="-V")',
    'q==="env"&&rP7.test(O)',
    'z.trim().split(/\\s+/)',
  ]) {
    assert.ok(parser.includes(fragment), fragment)
  }
})

test('source routes deny and ask matching through the recovered argv parser', sourceOptions, () => {
  const owner = source('src/tools/BashTool/bashPermissions.ts')
  for (const fragment of [
    "env: new Set(['-u', '-C', '--unset', '--chdir'])",
    "env: new Set(['-S', '--split-string'])",
    "ltrace: new Set([",
    "'-F',",
    "nsenter: new Set(['-t', '-S', '-G', '--target', '--setuid', '--setgid'])",
    'export function stripWrappersFromArgv(argv: string[]): string[]',
    'const wrapperStrippedArgv = stripWrappersFromArgv(parsed)',
    "const normalizedPrefix = bashRule.prefix.replace(/[ \\t]+/g, ' ')",
    "const normalizedCommand = cmdToMatch.replace(/[ \\t]+/g, ' ')",
    'astCommand: commands.length === 1 ? commands[0] : undefined',
    '{ astCommand: subcommand }',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
})

test('argv wrappers expose the actual nested command without broadening queries', sourceOptions, async () => {
  const { stripWrappersFromArgv } = await instantiateWrapperHarness()

  assert.deepEqual(
    stripWrappersFromArgv([
      'env',
      '-u',
      'FOO',
      'sudo',
      '-u',
      'root',
      'strace',
      '-e',
      'openat',
      'git',
      'status',
    ]),
    ['git', 'status'],
  )
  assert.deepEqual(
    stripWrappersFromArgv(['env', '-S', 'flock -w 3 lock git status']),
    ['git', 'status'],
  )
  assert.deepEqual(
    stripWrappersFromArgv(['script', '--command=git status']),
    ['git', 'status'],
  )
  assert.deepEqual(
    stripWrappersFromArgv(['ltrace', '-F', 'config', 'git', 'status']),
    ['git', 'status'],
  )
  assert.deepEqual(
    stripWrappersFromArgv([
      'nsenter',
      '-S',
      '1000',
      '--target',
      '123',
      'git',
      'status',
    ]),
    ['git', 'status'],
  )
  assert.deepEqual(stripWrappersFromArgv(['chrt', '99', 'git', 'status']), [
    'git',
    'status',
  ])
  assert.deepEqual(
    stripWrappersFromArgv(['taskset', '0xff', 'git', 'status']),
    ['git', 'status'],
  )
  assert.deepEqual(stripWrappersFromArgv(['command', '-v', 'git']), [
    'command',
    '-v',
    'git',
  ])
  assert.deepEqual(stripWrappersFromArgv(['git', 'status']), ['git', 'status'])
})
