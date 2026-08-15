import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
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

const pinnedUnits = new Map([
  [
    6189,
    [
      4393116,
      4393211,
      '0678a249e4ed8f87bb2b0c930d82e8e88072a87080438233f3774e038a84553b',
    ],
  ],
  [
    6191,
    [
      4393225,
      4393398,
      '048e0d72ee3b27b929f2244b97cfbbc1036e2cd11ad7d8771b7417795af96d79',
    ],
  ],
  [
    6203,
    [
      4394463,
      4396913,
      '6a1b1df1931e0f5cb75d8f1b4dff0e35d1ff14f79218b2fc988e17789dcbfbf9',
    ],
  ],
  [
    10910,
    [
      8606833,
      8608721,
      '51fbd88c309ca2bd286ac486a70e153e7d7271d19098c84d76832c536f40d411',
    ],
  ],
  [
    10912,
    [
      8608931,
      8609027,
      '05b8d24346b143e3ce9f449861502b1f3343d277c4724cbd3800b870923e5b6d',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('target92 pins the embedded seccomp setup and its reachable callers', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')

  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    'return process.platform==="linux"&&Zj()',
    'return{applyPath:`/proc/self/fd/${ib1}`,argv0:"apply-seccomp"}',
    'seccomp: failed to open /proc/self/exe:',
    'seccomp:Nz4()',
    'let k=$?await Vz4():void 0',
    'if(_!==void 0)z[ib1]=_',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source recovers embedded seccomp descriptor setup and sandbox config', sourceOptions, () => {
  const seccomp = assertFragments('src/utils/sandbox/seccomp.ts', [
    'export const SECCOMP_CHILD_FD = 3',
    "process.platform === 'linux' && isInBundledMode()",
    "return await open('/proc/self/exe', 'r')",
    'seccomp: failed to open /proc/self/exe:',
    'return (await openExecutableForSeccomp())?.fd',
    'applyPath: `/proc/self/fd/${SECCOMP_CHILD_FD}`',
    "argv0: 'apply-seccomp'",
  ])
  assert.ok(
    seccomp.indexOf('if (!canUseEmbeddedSeccomp()) return undefined') <
      seccomp.indexOf("return await open('/proc/self/exe', 'r')"),
    'the executable is opened only on bundled Linux',
  )

  assertFragments('src/utils/sandbox/sandbox-adapter.ts', [
    "import { getEmbeddedSeccompConfig } from './seccomp.js'",
    'seccomp: getEmbeddedSeccompConfig(),',
  ])
})

test('source passes the memoized executable descriptor as child fd 3 only for sandboxed commands', sourceOptions, () => {
  const shell = assertFragments('src/utils/Shell.ts', [
    'getEmbeddedSeccompFileDescriptor,',
    'SECCOMP_CHILD_FD,',
    "type SpawnStdio = Array<'pipe' | number | undefined>",
    'stdio[SECCOMP_CHILD_FD] = seccompFileDescriptor',
    'const seccompFileDescriptor = shouldUseSandbox',
    '? await getEmbeddedSeccompFileDescriptor()',
    'stdio: getSpawnStdio(',
    'outputHandle?.fd,',
    'seccompFileDescriptor,',
  ])
  assert.ok(
    shell.indexOf('const seccompFileDescriptor = shouldUseSandbox') <
      shell.indexOf('const childProcess = spawn('),
    'descriptor setup precedes child creation',
  )
  assert.ok(
    shell.indexOf('stdio[SECCOMP_CHILD_FD] = seccompFileDescriptor') <
      shell.indexOf('const childProcess = spawn('),
    'stdio construction owns the inherited fd slot',
  )
})
