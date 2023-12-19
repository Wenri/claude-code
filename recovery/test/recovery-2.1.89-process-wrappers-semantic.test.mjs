import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.88-to-2.1.89'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const targetSha256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'
const latestSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
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

const pinned = new Map([
  [2308, [942362, 942547, 'FunctionDeclaration', '96b49525efcb9e5abcb6379627b034e262c329d5d714499cd5ba9511b2a3f6b0']],
  [2309, [942547, 942729, 'FunctionDeclaration', '518566352b251c5759e0b3bc9813965a1d752ceb55dc3cd4c3af244a90f6a3c2']],
  [9810, [8121055, 8121224, 'FunctionDeclaration', 'c01f848fd47313c815f2404d8f447875a2ff89997e5fb85373890f1562fbf893']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function requiredTargetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE environment variable must be set',
  )
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  return bytes.toString('utf8')
}

test('target89 pins both safe process façades and the reachable quote helper', {
  skip: !selected || !targetBundlePath,
}, () => {
  const bundle = requiredTargetBundle()
  for (const [index, [start, end, nodeType, sourceHash]] of pinned) {
    const region = structural.regions[index]
    assert.deepEqual(
      [
        region.classification,
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      ['unresolved', index, start, end, nodeType, sourceHash],
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash)
  }

  const asyncFacade = bundle.slice(942362, 942547)
  const syncFacade = bundle.slice(942547, 942729)
  for (const facade of [asyncFacade, syncFacade]) {
    assert.match(facade, /if\(\w+\(\)\)\{/)
    assert.match(facade, /\w+\(q\)/)
    assert.match(facade, /if\(z===null\)throw Error\(`/)
    assert.match(
      facade,
      /not found or is in an unsafe location \(current directory\)/,
    )
    assert.ok(facade.indexOf('z===null') < facade.lastIndexOf('return'))
  }

  assert.equal(
    bundle.slice(8121055, 8121224),
    'function EK(q){return q.map((K)=>{let _=String(K);if(_==="")return"\'\'";if(/^[A-Za-z0-9_./:=@+,-]+$/.test(_))return _;return"\'"+_.replaceAll("\'",`\'"\'"\'`)+"\'"}).join(" ")}',
  )

  if (latestBundlePath) {
    const latestBytes = fs.readFileSync(latestBundlePath)
    assert.equal(sha256(latestBytes), latestSha256)
    const latest = latestBytes.toString('utf8')
    const latestFragments = [
      [951195, 951219, '7b7b86f8dbad0b59666bb1c3d25569a9da0580651e87d2970ab348e7e5db805f'],
      [951219, 951404, 'c96f877c4924782495e74e1ef3a5ea70a895246352f58d914756ee908ad6d4d0'],
      [951404, 951586, '378387acdfbfbd5de7e9e5ac025d3fb3940de12e73d23fa48f5027e37a10305f'],
      [7613341, 7613510, 'afb0c7a90d15a14fc85882c8b1e43ca05b71ff5fce11ab17be2c3d9979bbfa53'],
    ]
    for (const [start, end, hash] of latestFragments) {
      assert.equal(sha256(latest.slice(start, end)), hash)
    }
  }
})

test('historical and current source own the exact safe argv process graph', {
  skip: !selected,
}, () => {
  const wrapper = source('utils/execa.ts')
  assert.match(wrapper, /function isWindows\(\): boolean \{\s*return process\.platform === 'win32'/)
  assert.match(
    wrapper,
    /export async function execa\([\s\S]*?whichSync\(command\)[\s\S]*?executable === null[\s\S]*?not found or is in an unsafe location \(current directory\)[\s\S]*?execaBase\(executable, \[\.\.\.args\], options\)[\s\S]*?execaBase\(command, \[\.\.\.args\], options\)/,
  )
  assert.match(
    wrapper,
    /export function execaSync\([\s\S]*?whichSync\(command\)[\s\S]*?executable === null[\s\S]*?execaSyncBase\(executable, \[\.\.\.args\], options\)[\s\S]*?execaSyncBase\(command, \[\.\.\.args\], options\)/,
  )

  const auth = source('utils/auth.ts')
  assert.match(auth, /import \{ execa as safeExeca \} from '\.\/execa\.js'/)
  assert.match(auth, /safeExeca\('security', \['-i'\], \{[\s\S]*?input: command,[\s\S]*?reject: false/)
  assert.match(
    source('utils/powershell/parser.ts'),
    /import \{ execa \} from '\.\.\/execa\.js'[\s\S]*?execa\(pwshPath, args,/,
  )
  assert.match(
    source('utils/github/ghAuthStatus.ts'),
    /import \{ execa \} from '\.\.\/execa\.js'[\s\S]*?execa\('gh', \['auth', 'token'\],/,
  )
  assert.match(
    source('utils/secureStorage/macOsKeychainStorage.ts'),
    /import \{ execaSync \} from '\.\.\/execa\.js'[\s\S]*?execaSync\('security', \['-i'\],/,
  )
  assert.match(
    source('commands/thinkback/thinkback.tsx'),
    /import \{ execa \} from '\.\.\/\.\.\/utils\/execa\.js';[\s\S]*?execa\('node', \[playerPath\],/,
  )
  assert.match(
    source('commands/remote-setup/remote-setup.tsx'),
    /import \{ execa \} from '\.\.\/\.\.\/utils\/execa\.js';[\s\S]*?execa\('gh', \['auth', 'token'\],/,
  )
})

test('the quote helper is reachable only with string-valued process arguments', {
  skip: !selected,
}, () => {
  const quote = source('utils/bash/shellQuote.ts')
  const spawn = source('utils/swarm/spawnUtils.ts')
  const panes = source('utils/swarm/backends/PaneBackendExecutor.ts')

  assert.match(
    quote,
    /quote as shellQuoteQuote,[\s\S]*?export function quote\(args: ReadonlyArray<unknown>\): string/,
  )
  assert.match(quote, /shellQuoteQuote\(validated\)/)
  assert.match(spawn, /import \{ quote \} from '\.\.\/bash\/shellQuote\.js'/)
  assert.match(spawn, /quote\(\[modelOverride\]\)/)
  assert.match(spawn, /quote\(\[settingsPath\]\)/)
  assert.match(spawn, /quote\(\[pluginDir\]\)/)
  assert.match(spawn, /quote\(\[value\]\)/)
  assert.match(
    panes,
    /import \{ quote \} from '\.\.\/\.\.\/\.\.\/utils\/bash\/shellQuote\.js'/,
  )
  assert.match(panes, /quote\(\[config\.name\]\)/)
  assert.match(panes, /quote\(\[workingDir\]\)/)
  assert.match(panes, /quote\(\[binaryPath\]\)/)
})
