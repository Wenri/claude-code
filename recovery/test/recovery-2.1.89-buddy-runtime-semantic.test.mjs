import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.88-to-2.1.89'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetPath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
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
  [15351, [11209817, 11210512, 'FunctionDeclaration', '8f88f60b7c381bbe7771c48f43bc0760ff32d40dbe69cff1c0794a387fa3a432']],
  [15355, [11210630, 11210929, 'FunctionDeclaration', '0edf3444351207574d147e5accecb12644b438cb38a6bedc473942d8335fc31e']],
  [15357, [11211250, 11211452, 'FunctionDeclaration', '15dae3cf34038613f0d9e0c628c17e38e50c006185bc0de204ccda57bdb0aca5']],
  [15358, [11211452, 11211605, 'FunctionDeclaration', 'c193e4c4702b1e09ac2c617c6be40a8696d93517a2631d01a5a132a21a1c0de0']],
  [15360, [11211663, 11211696, 'FunctionDeclaration', '2608c941c4e378a417ece9bdeccb151061ee68fef22619efda817033ea6d10d6']],
  [15361, [11211696, 11212040, 'FunctionDeclaration', '152fc454f3ccf4ea7a573c0a3633090ac409b51ecac419ad9c8662edcae042a6']],
  [15362, [11212040, 11212259, 'FunctionDeclaration', '0c55ec0efb1e6c4587db78fa163fab39857de3a5b0b7d6e63242ae80a9433e08']],
  [15363, [11212259, 11212422, 'FunctionDeclaration', 'e3b687695d4d1dab06256ae1b1b89dba5a9ed00318ec49f2c07bb5d8516e523b']],
  [15364, [11212422, 11212870, 'FunctionDeclaration', '22f1c37ef851c86dc1d425025470fb583aa7e3ecac4696b52294134b7cdc3156']],
  [15366, [11212921, 11213149, 'VariableDeclaration', '08b625efc64f883f16a5edafbf644ee4e9f3d8ff11afc2d9897a6b33d5ad5a81']],
  [15367, [11213149, 11213292, 'FunctionDeclaration', '8846834e5a9a750660d3adacc41b787ff7d08a543f5d97dd4bc92158cfa15bfe']],
  [15368, [11213292, 11214106, 'FunctionDeclaration', '49df7afd15582fe9e35a0b592559cc4d04bbdd9a6f35f03e6e90adc017bebf86']],
  [15369, [11214106, 11214258, 'FunctionDeclaration', '3bdf8f4edb11f82af5bb198be8ffb09aac94fbfc90e5fb6f0293f6ee0c11c5c0']],
  [15370, [11214258, 11215057, 'VariableDeclaration', '481c1a7d4467d0db48c556705ef7108a0bb0d64ac3378a572c3048ed970f1324']],
  [15371, [11215057, 11216477, 'VariableDeclaration', '7dacb91e0f99e32f6a33061af7b22d979661ffa02fac8c2760518753f05ebb1d']],
  [15372, [11216477, 11216625, 'FunctionDeclaration', '16640826a4eecd545d35f646107471c432c8b2741ff1e1e3fc8962a1a74d99c3']],
  [15375, [11216860, 11217215, 'FunctionDeclaration', '39796bcb6ca15ae1c2afbed05b6d94229741dd3abccea94f5e789f983dc5795c']],
  [15376, [11217215, 11217341, 'FunctionDeclaration', '043f73f1fd561877c841997c4bc38ee10f382134212bbbf00c54de8ee8021501']],
  [15379, [11217411, 11217620, 'FunctionDeclaration', 'b6777dc0b88753585fc5c6af150c265cfffaa9a5d7c3225f70293be974b51b8d']],
  [15381, [11217657, 11218197, 'FunctionDeclaration', '9f20b1f215f6e71cf697314ee2f2f6e6de860c4f77b847b5ddd751aaa97b38af']],
  [15383, [11218209, 11222961, 'VariableDeclaration', '0b197cb6dc287ba3c6b1a63160e19c512a5963b17820be61b39ebbef3c514370']],
  [15384, [11222961, 11223835, 'FunctionDeclaration', 'cf28175fce901bf25ba831150a897c241e25db1a8680c40a9d52cc77580ae8a1']],
  [15385, [11223835, 11226270, 'FunctionDeclaration', 'c5b8277fab79562a12c9a7ccc59e0896fce0686b0efc0ccf4791b3d58d0f2332']],
  [15388, [11226330, 11228809, 'FunctionDeclaration', '5f3477d7f9f2d0db24db19a9f21eb5b34505549def69c62fc56f3fc783c5311b']],
  [15391, [11228866, 11228905, 'VariableDeclaration', 'a1380068ba9bd24eb0643e34cdfdfc6d630e923f623ee299ce37d9d801c3f054']],
  [15392, [11228905, 11230017, 'VariableDeclaration', 'f694edfda1763ee4a5630336011d0a2a10e10ca850735c07a85e894ff4bf94c2']],
  [15395, [11230054, 11230221, 'FunctionDeclaration', '508c701d9025707102c804fdda9694c943515c530d5f972119a65f4bca4831b9']],
  [15396, [11230221, 11230309, 'FunctionDeclaration', 'e4d65fe1a1f9db84a66fdb5b6939feefa70a7d1346f83df112e214d88d354903']],
  [15398, [11230325, 11231439, 'VariableDeclaration', '54e916531fe9053c27c4659bb1eb1c068de15343bf94b1823cf1803025c6e4f0']],
  [16579, [11930986, 11932465, 'FunctionDeclaration', '2df4839cfabc85e86b232fb7c818155b72389500beaf822644d8c4782dd5d815']],
  [16581, [11932508, 11932646, 'FunctionDeclaration', '02d708ce372c55d494420e938b0289aafb3d1fc5ce894e3d98a311d5f51ae6c4']],
  [16582, [11932646, 11934568, 'FunctionDeclaration', '1be04d42990e4f84b5b373b6524e03ba42e0451b2fc804ce4800a797ce03fc3e']],
  [16583, [11934568, 11935148, 'FunctionDeclaration', 'fa4411d8c2cb2df5c4a22f7c2a23733580c2f7d8bb9a282d7b2227c767491b44']],
  [16586, [11935221, 11935264, 'FunctionDeclaration', '5aa853975e1b9dbf64b6eb8b3bcfeba782e3310593cb46143d2cbc213be81ea6']],
  [16587, [11935264, 11935353, 'VariableDeclaration', 'ef82b70d829aab90f836ae728ad872c31641d99a21859d3afa9b5cd37d247435']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function controlSignature(text) {
  const ast = parse(text, {
    allowHashBang: true,
    allowReturnOutsideFunction: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const controls = new Map()
  const operators = new Map()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (/^(?:If|Switch|For|While|DoWhile|Try|Catch|Conditional|Logical|Await|Yield|Return|Throw)/.test(node.type)) {
      controls.set(node.type, (controls.get(node.type) ?? 0) + 1)
    }
    if (typeof node.operator === 'string') {
      operators.set(node.operator, (operators.get(node.operator) ?? 0) + 1)
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'raw', 'start'].includes(key)) visit(child)
    }
  }
  visit(ast)
  return [
    [...controls].sort(),
    [...operators].sort(),
  ]
}

test(
  'target89 pins every buddy unit and the aggregate operator/control graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.89 bundle is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(bytes),
      'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
    )
    const target = bytes.toString('utf8')
    const controls = []
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
      const unit = target.slice(start, end)
      assert.equal(sha256(unit), hash, `${index}: bytes`)
      controls.push([index, ...controlSignature(unit)])
    }
    assert.equal(
      sha256(JSON.stringify(controls)),
      '00e35cb51dadede48188ee1efdb0b0ce7067e9dba40d04839f48e1a6ddd9f451',
      'buddy branch/operator graph drifted',
    )
  },
)

test(
  'source owns the complete buddy API, soul, notification, hatch, pet, and sprite flow',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const observer = source('buddy/observer.ts')
    const companion = source('buddy/companion.ts')
    const soul = source('buddy/soul.ts')
    const notification = source('buddy/useBuddyNotification.tsx')
    const sprites = source('buddy/sprites.ts')
    const command = source('commands/buddy/index.tsx')
    const spriteView = source('buddy/CompanionSprite.tsx')

    for (const fragment of [
      "getAPIProvider() !== 'firstParty'",
      'getGlobalConfig().companionMuted',
      '/claude_code/buddy_react',
      'name: companion.name.slice(0, 32)',
      'personality: companion.personality.slice(0, 200)',
      'transcript: transcript.slice(0, 5000)',
      "type ReactionReason = 'test-fail'",
      "return 'test-fail'",
      "return 'large-diff'",
      'AbortSignal.timeout(10_000)',
    ]) assert.ok(observer.includes(fragment), `observer: ${fragment}`)
    assert.ok(
      observer.indexOf('const specialReason = addressed ? null') <
        observer.indexOf("const reason = specialReason ?? 'turn'"),
    )

    for (const fragment of [
      'inspirationSeed',
      'shiny',
      'rarity',
      'species',
    ]) assert.ok(companion.includes(fragment), `companion: ${fragment}`)
    for (const fragment of [
      'Generate a companion.',
      'Math.imul(state, 1_664_525) + 1_013_904_223',
      "querySource: 'buddy_companion'",
      "type: 'json_schema'",
      'SOUL_SCHEMA',
      'fallbackCompanionSoul',
    ]) assert.ok(soul.includes(fragment), `soul: ${fragment}`)
    assert.ok(
      soul.indexOf('await sideQuery') <
        soul.indexOf('fallbackCompanionSoul(bones)'),
    )

    for (const fragment of [
      'export function isBuddyLive',
      'config.companion || !isBuddyLive()',
      'buddy-teaser',
      'timeoutMs: 15000',
      'export function findBuddyTriggerPositions',
      '/\\/buddy\\b/g',
    ]) assert.ok(notification.includes(fragment), `notification: ${fragment}`)
    for (const fragment of [
      'export function renderSprite',
      'export function renderFace',
      "bones.hat !== 'none'",
      "replaceAll('{E}', bones.eye)",
    ]) assert.ok(sprites.includes(fragment), `sprites: ${fragment}`)

    for (const fragment of [
      'export function CompanionStat',
      'export function CompanionCard',
      'export function BuddyHatch',
      'SHAKE_CYCLES * SHAKE_FRAME_COUNT',
      'generateAndSaveCompanion',
      "name: 'buddy'",
      "action === 'pet'",
      "action === 'off'",
      'companionPetAt: Date.now()',
      'fireCompanionPetObserver',
      'rollWithSeed(randomUUID())',
    ]) assert.ok(command.includes(fragment), `command: ${fragment}`)
    assert.ok(
      command.indexOf('generateCompanionSoul(') <
        command.indexOf('saveGlobalConfig(current =>'),
    )

    for (const fragment of [
      'export function CompanionFloatingBubble',
      'export function companionReservedColumns',
      'companionReaction',
      'companionPetAt',
      'PET_BURST_MS = 2500',
      'companionReaction: undefined',
      'BUBBLE_SHOW * TICK_MS',
      'renderSprite(companion',
      'renderFace(companion)',
    ]) assert.ok(spriteView.includes(fragment), `sprite view: ${fragment}`)
  },
)
